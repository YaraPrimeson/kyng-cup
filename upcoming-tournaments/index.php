<?php
declare(strict_types=1);

const CALENDAR_SLOT = '<div data-calendar-initial=""><!--KYNG_CALENDAR_INITIAL--></div>';

function calendar_escape(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function calendar_fetch(array $config, string $todayInUtc): ?array {
    if (!$config['sports']) {
        return [];
    }
    $query = http_build_query([
        'select' => 'slug,name,sport,location,starts_at,ends_at,status,registration_status,prize_pool',
        'sport' => 'in.(' . implode(',', $config['sports']) . ')',
        'or' => '(status.eq.live,and(status.eq.published,or(ends_at.gte.' . $todayInUtc .
            ',and(ends_at.is.null,starts_at.gte.' . $todayInUtc . '))))',
        'slug' => 'not.match.^(kyng|kyngcup)-qa-',
        'order' => 'starts_at.asc.nullslast,slug.asc',
    ], '', '&', PHP_QUERY_RFC3986);
    $request = curl_init($config['supabaseUrl'] . '/rest/v1/tournaments?' . $query);
    curl_setopt_array($request, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT_MS => 6500,
        CURLOPT_TIMEOUT_MS => 9000,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'apikey: ' . $config['publishableKey']],
    ]);
    $body = curl_exec($request);
    $status = curl_getinfo($request, CURLINFO_RESPONSE_CODE);
    $networkError = curl_errno($request);
    curl_close($request);
    if ($status !== 200 || !is_string($body)) {
        error_log("KYNG CUP calendar: feed request failed (HTTP $status, cURL $networkError).");
        return null;
    }
    $rows = json_decode($body, true);
    return is_array($rows) && array_is_list($rows) ? $rows : null;
}

function calendar_markup(array $rows, DateTimeZone $vienna): string {
    usort($rows, static fn(array $a, array $b): int =>
        (int) ($b['status'] === 'live') <=> (int) ($a['status'] === 'live'));

    $html = '';
    foreach ($rows as $row) {
        $name = calendar_escape($row['name']);
        $sport = calendar_escape($row['sport']);
        $anchor = $sport . '-' . calendar_escape($row['slug']);
        $venue = calendar_escape($row['location'] ?: 'Vienna, Austria · Club to be announced');
        if ($row['location'] === 'Vienna, Austria') {
            $venue .= ' · Club to be announced';
        }
        $registration = match ($row['registration_status']) {
            'open' => 'Open',
            'waitlist' => 'Waitlist',
            default => 'Closed',
        };
        $start = $row['starts_at'] ? (new DateTimeImmutable($row['starts_at']))->setTimezone($vienna) : null;
        $end = $row['ends_at'] ? (new DateTimeImmutable($row['ends_at']))->setTimezone($vienna) : null;
        $date = $start ? '<time datetime="' . $start->format('Y-m-d') . '">' . $start->format('j F Y') . '</time>' : 'Date to be announced';
        if ($start && $end && $start->format('Y-m-d') !== $end->format('Y-m-d')) {
            $date .= ' – <time datetime="' . $end->format('Y-m-d') . '">' . $end->format('j F Y') . '</time>';
        }
        $prize = $row['prize_pool'] ? '<div><dt>Prize pool</dt><dd>' . calendar_escape($row['prize_pool']) . '</dd></div>' : '';
        $action = '';
        if ($registration !== 'Closed') {
            $href = '/register/?tournament=' . rawurlencode($row['slug']) . '&sport=' . rawurlencode($row['sport']);
            $label = $registration === 'Waitlist' ? 'Join the waitlist' : 'Register for ' . ucfirst($sport);
            $action = '<a class="upcoming-page__button" href="' . calendar_escape($href) . '">' . $label . ' <span>↗</span></a>';
        }
        $html .= '<section class="upcoming-page__detail" id="' . $anchor . '"><div class="upcoming-page__detail-intro"><h2>' .
            $name . '</h2></div><div class="upcoming-page__detail-body"><div class="upcoming-page__texture upcoming-page__texture--' .
            $sport . '" aria-hidden="true"></div><div><p class="upcoming-page__date">' . $date .
            '</p><dl><div><dt>Venue</dt><dd>' . $venue . '</dd></div><div><dt>Registration</dt><dd>' .
            $registration . '</dd></div>' . $prize . '</dl>' . $action . '</div></div></section>';
    }
    return $html ?: '<section class="upcoming-page__selector"><p>No upcoming tournaments have been announced yet.</p></section>';
}

if (str_ends_with((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/index.php')) {
    header('Location: /upcoming-tournaments/', true, 301);
    exit;
}
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
$template = file_get_contents(__DIR__ . '/index.html');
if ($template === false) {
    http_response_code(503);
    exit('Calendar temporarily unavailable.');
}

$markup = '<section class="upcoming-page__selector"><p>Upcoming tournament details are temporarily unavailable.</p></section>';
try {
    $config = json_decode(file_get_contents(__DIR__ . '/calendar-config.json'), true, 512, JSON_THROW_ON_ERROR);
    $vienna = new DateTimeZone('Europe/Vienna');
    $todayInUtc = (new DateTimeImmutable('today', $vienna))->setTimezone(new DateTimeZone('UTC'))->format(DATE_ATOM);
    $rows = calendar_fetch($config, $todayInUtc);
    if ($rows !== null) {
        $markup = calendar_markup($rows, $vienna);
    }
} catch (Throwable $error) {
    error_log('KYNG CUP calendar: ' . $error->getMessage());
}
echo str_replace(CALENDAR_SLOT, '<div data-calendar-initial="">' . $markup . '</div>', $template);
