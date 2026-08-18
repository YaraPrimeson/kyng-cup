import Wordmark from "./wordmark";

const Arrow = () => <span aria-hidden="true">↗</span>;

export default function Home() {
  return (
    <main>
      <section className="hero" id="top">
        <header className="site-header">
          <a className="brand" href="#top" aria-label="KYNG CUP home">
            <Wordmark />
          </a>
          <nav className="nav" aria-label="Main navigation">
            <a href="#about">About</a>
            <a href="#tournament">Tournament</a>
            <a href="bracket/">Live bracket</a>
            <a href="#community">Community</a>
          </nav>
          <a className="header-cta" href="#register">
            Join the cup <Arrow />
          </a>
        </header>

        <div className="hero-copy">
          <p className="eyebrow">International tennis community · Vienna</p>
          <h1>
            More than
            <br />a game<span className="accent-dot">.</span>
          </h1>
          <p className="hero-intro">
            Tournament-level competition. A community built around sport,
            ambition and the people you want to meet again.
          </p>
        </div>

        <div className="hero-footer">
          <div className="next-event">
            <span>Next cup</span>
            <strong>19—20.09</strong>
            <span>Vienna, Austria</span>
          </div>
        </div>
      </section>

      <section className="manifesto" id="about">
        <div className="section-index">
          <span>01</span>
          <span>Our approach</span>
        </div>
        <div className="manifesto-copy">
          <p className="kicker">Not just a tournament</p>
          <h2>
            The level of competition.
            <br />The ease of belonging.
          </h2>
          <p className="manifesto-lead">
            KYNG CUP brings together athletes, founders, coaches and committed
            amateurs through tennis and padel. Every detail is designed so you
            can focus on the match — and enjoy everything around it.
          </p>
        </div>
        <div className="principle-card">
          <span className="principle-number">100%</span>
          <p>Attention to every match, every player and every detail.</p>
        </div>
      </section>

      <section className="experience" id="community">
        <div className="experience-visual" role="img" aria-label="Tennis player in motion on a clay court">
          <div className="visual-label">
            <span>KYNG standard</span>
            <strong>Play seriously.<br />Feel at home.</strong>
          </div>
        </div>
        <div className="experience-copy">
          <div className="section-index light">
            <span>02</span>
            <span>The experience</span>
          </div>
          <h2>Built for the match.<br />Remembered for the atmosphere.</h2>
          <div className="experience-list">
            <article>
              <span>01</span>
              <div>
                <h3>Competition with respect</h3>
                <p>Strong opponents, fair judging and a format that respects every level.</p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>Details that feel effortless</h3>
                <p>Clear schedules, quality courts, new balls and a team that stays present.</p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>A community beyond the court</h3>
                <p>New rivals become familiar faces, useful contacts and lasting friends.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="tournament" id="tournament">
        <div className="section-index">
          <span>03</span>
          <span>Upcoming tournament</span>
        </div>
        <div className="tournament-title">
          <p className="kicker">Vienna · September 2026</p>
          <h2>Two days.<br />One community.</h2>
          <a className="bracket-link" href="bracket/">Open live bracket <Arrow /></a>
        </div>
        <div className="date-grid">
          <div className="date-card terracotta">
            <span>Saturday</span>
            <strong>19</strong>
            <span>Qualifying & group stage</span>
          </div>
          <div className="date-card peach">
            <span>Sunday</span>
            <strong>20</strong>
            <span>Finals & closing night</span>
          </div>
          <div className="event-details">
            <div><span>Location</span><strong>Vienna, Austria</strong></div>
            <div><span>Courts</span><strong>Tennis & padel</strong></div>
            <div><span>Players</span><strong>International field</strong></div>
            <div><span>Registration</span><strong>Limited draw</strong></div>
          </div>
        </div>
      </section>

      <section className="home-bracket-cta" aria-labelledby="home-bracket-title">
        <div className="home-bracket-copy">
          <div className="section-index">
            <span>04</span>
            <span>Live tournament</span>
          </div>
          <span className="home-live-label"><i /> Results update automatically</span>
          <h2 id="home-bracket-title">Follow every<br />match<span className="accent-dot">.</span></h2>
          <p>See the full tournament draw, match times, courts and live results as each pair moves toward the final.</p>
          <a href="bracket/">Open tournament bracket <Arrow /></a>
        </div>
        <div className="home-bracket-preview" aria-hidden="true">
          <div className="preview-round-labels"><span>Round of 16</span><span>Quarterfinal</span><span>Final</span></div>
          <div className="preview-bracket-grid">
            <div className="preview-column">
              <div className="preview-match"><span><b>01</b> Vienna Pair</span><span><b>08</b> King&apos;s Court</span></div>
              <div className="preview-match"><span><b>04</b> Clay Club</span><span><b>05</b> Match Point</span></div>
              <div className="preview-match"><span><b>03</b> Baseline</span><span><b>06</b> Topspin</span></div>
            </div>
            <div className="preview-column preview-middle">
              <div className="preview-match is-highlighted"><span><b>01</b> Vienna Pair</span><span><b>04</b> Clay Club</span></div>
              <div className="preview-match"><span><b>03</b> Baseline</span><span><b>02</b> Centre Court</span></div>
            </div>
            <div className="preview-column preview-final">
              <div className="preview-match is-live"><small>Live · Centre court</small><span><b>01</b> Vienna Pair</span><span><b>02</b> Centre Court</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="registration" id="register">
        <div className="registration-copy">
          <p className="eyebrow">The next point starts here</p>
          <h2>Become part<br />of KYNG CUP.</h2>
          <p>
            Leave your contact and we’ll send the tournament format, player
            categories and registration details.
          </p>
        </div>
        <form className="interest-form">
          <label>
            <span>Name</span>
            <input type="text" name="name" placeholder="Your name" />
          </label>
          <label>
            <span>Email or Telegram</span>
            <input type="text" name="contact" placeholder="How can we reach you?" />
          </label>
          <label>
            <span>I play</span>
            <select name="sport" defaultValue="tennis">
              <option value="tennis">Tennis</option>
              <option value="padel">Padel</option>
              <option value="both">Both</option>
            </select>
          </label>
          <button type="submit">Request an invitation <Arrow /></button>
          <small>By submitting, you agree to be contacted about KYNG CUP tournaments.</small>
        </form>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><Wordmark /></a>
        <p>International tennis & padel community</p>
        <div className="footer-links">
          <a href="#top">Instagram</a>
          <a href="#top">Telegram</a>
          <a href="mailto:hello@kyngcup.com">Contact</a>
        </div>
        <span>© 2026</span>
      </footer>
    </main>
  );
}
