"use client";

import SiteFooter from "./site-footer";
import { Language, useLanguage } from "./i18n";

const copy: Record<Language, { eyebrow: string; title: string; intro: string; aboutLabel: string; aboutTitle: string; aboutText: string; choose: string; chooseTitle: string; tennisText: string; padelText: string; enter: string }> = {
  en: { eyebrow: "International racket-sport community · Vienna", title: "One community. Two ways to play.", intro: "KYNG CUP brings people together through serious competition, generous hospitality and the energy that continues after the final point.", aboutLabel: "What is KYNG CUP", aboutTitle: "Competition creates the moment. Community makes it matter.", aboutText: "We design tennis and padel tournaments for people who value the level of play as much as the people around it. Clear formats, considered details and an atmosphere worth returning to.", choose: "Choose your court", chooseTitle: "Where do you want to play?", tennisText: "Tradition, precision and the long rhythm of the match.", padelText: "Speed, instinct and a game built around partnership.", enter: "Explore" },
  uk: { eyebrow: "Міжнародна спільнота ракеткових видів спорту · Відень", title: "Одна спільнота. Два способи грати.", intro: "KYNG CUP об’єднує людей через серйозну конкуренцію, щиру гостинність та енергію, що триває після фінального розіграшу.", aboutLabel: "Що таке KYNG CUP", aboutTitle: "Змагання створює момент. Спільнота надає йому сенсу.", aboutText: "Ми створюємо тенісні та падел-турніри для людей, які однаково цінують рівень гри й оточення. Зрозумілі формати, продумані деталі та атмосфера, до якої хочеться повертатися.", choose: "Оберіть свій корт", chooseTitle: "У що ви хочете грати?", tennisText: "Традиція, точність і довгий ритм матчу.", padelText: "Швидкість, інстинкт і гра, побудована на партнерстві.", enter: "Дізнатися більше" },
  de: { eyebrow: "Internationale Racketsport-Community · Wien", title: "Eine Community. Zwei Arten zu spielen.", intro: "KYNG CUP verbindet Menschen durch ernsthaften Wettbewerb, aufmerksame Gastfreundschaft und eine Energie, die nach dem letzten Punkt weiterlebt.", aboutLabel: "Was ist KYNG CUP", aboutTitle: "Wettbewerb schafft den Moment. Community gibt ihm Bedeutung.", aboutText: "Wir gestalten Tennis- und Padel-Turniere für Menschen, denen das Spielniveau ebenso wichtig ist wie die Menschen darum. Klare Formate, durchdachte Details und eine Atmosphäre, zu der man gern zurückkehrt.", choose: "Wähle deinen Court", chooseTitle: "Wie möchtest du spielen?", tennisText: "Tradition, Präzision und der lange Rhythmus des Matches.", padelText: "Tempo, Instinkt und ein Spiel, das von Partnerschaft lebt.", enter: "Entdecken" },
  ru: { eyebrow: "Международное сообщество ракеточных видов спорта · Вена", title: "Одно сообщество. Два способа играть.", intro: "KYNG CUP объединяет людей через серьёзную конкуренцию, тёплое гостеприимство и энергию, которая остаётся после финального розыгрыша.", aboutLabel: "Что такое KYNG CUP", aboutTitle: "Соревнование создаёт момент. Сообщество придаёт ему смысл.", aboutText: "Мы создаём турниры по теннису и паделу для людей, которым одинаково важны уровень игры и окружение. Понятные форматы, продуманные детали и атмосфера, в которую хочется возвращаться.", choose: "Выберите свой корт", chooseTitle: "Во что вы хотите играть?", tennisText: "Традиция, точность и длинный ритм матча.", padelText: "Скорость, инстинкт и игра, построенная на партнёрстве.", enter: "Подробнее" },
};

export default function Home() {
  const { language } = useLanguage();
  const c = copy[language];
  return <main className="universal-page">
    <section className="universal-hero"><div><p className="eyebrow">{c.eyebrow}</p><h1>{c.title}</h1><p>{c.intro}</p></div><span className="universal-scroll">KYNG CUP · 2026</span></section>
    <section className="universal-about"><div className="section-index"><span>01</span><span>{c.aboutLabel}</span></div><div><h2>{c.aboutTitle}</h2><p>{c.aboutText}</p></div></section>
    <section className="sport-choice"><div className="section-index"><span>02</span><span>{c.choose}</span></div><h2>{c.chooseTitle}</h2><div className="sport-choice-grid">
      <a className="sport-choice-card tennis-choice" href="/tennis/"><span>Tennis</span><p>{c.tennisText}</p><strong>{c.enter} ↗</strong></a>
      <a className="sport-choice-card padel-choice" href="/padel/"><span>Padel</span><p>{c.padelText}</p><strong>{c.enter} ↗</strong></a>
    </div></section>
    <SiteFooter />
  </main>;
}
