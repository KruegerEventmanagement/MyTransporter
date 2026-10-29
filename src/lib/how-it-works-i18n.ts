import type { Lang } from "@/lib/i18n/messages";
export type HowLang = Lang;

export type VideoKey = "open" | "close" | "obi";

export interface HowStep {
  title: string;
  text: string[];
  bullets?: string[];
  videos?: { key: VideoKey; caption: string }[];
  after?: string[];
}

import { EXTRA } from "./how-it-works-extra";
export interface HowCopy {
  heading: string;
  intro: string;
  cta: string;
  steps: HowStep[];
}

export const HOW_COPY: Record<HowLang, HowCopy> = {
  ...EXTRA,
  de: {
    heading: "So funktioniert's",
    intro: "In 8 einfachen Schritten zu deinem Transporter – von der Buchung bis zur Rückgabe.",
    cta: "Jetzt Transporter buchen",
    steps: [
      { title: "Datum wählen", text: ["Wähle oben zuerst die passende Schaltfläche:", "Tagesmiete (3 bis 24 Stunden): Tippe einmal auf deinen Wunschtag.", "Mehrere Tage (länger als 24 Stunden): Tippe zuerst auf den Abholtag und dann auf den Rückgabetag."] },
      { title: "Uhrzeit und Tarif", text: ["Wähle, ab wie viel Uhr du den Transporter möchtest. Dann wähle deinen Tarif: normal oder mit mehr Kilometern."] },
      {
        title: "Fahrzeug und Zubehör",
        text: ["Wähle das passende Fahrzeug. Bei jedem Transporter siehst du Laderaum in Kubikmetern, Höhe und Länge der Ladefläche."],
        bullets: [
          "Nur in der Stadt unterwegs? Der LEO MY 102 ist auf 100 km/h begrenzt – für kurze Wege ideal.",
          "Autobahnfahrt? Mit dem PF MY 1003 fährst du bequemer.",
          "Viel oder langes Ladegut? Achte auf die Länge der Ladefläche.",
        ],
      },
      { title: "Verifizierung", text: ["Mache einfache Fotos von Führerschein und Ausweis (Vorder- und Rückseite) und lade sie hoch."] },
      { title: "Registrieren und bezahlen", text: ["Registriere dich mit deiner E-Mail und einem selbst gewählten Passwort. Dann bezahlst du online."] },
      {
        title: "Schlüsselcode per E-Mail",
        text: ["Du bekommst eine Buchungsbestätigung und die Rechnung. 15 Minuten vor Abholung kommt eine E-Mail mit deinem Schlüsselcode und der Nummer deines Schlüsselkastens."],
        videos: [
          { key: "open", caption: "So öffnest du den Schlüsselkasten" },
          { key: "close", caption: "So schließt du ihn wieder" },
        ],
      },
      {
        title: "Schlüssel abholen und zum Transporter",
        text: ["Die Schlüsselkästen hängen beim OBI in Leonberg, vor dem Eingang an den Fahrradständern."],
        videos: [{ key: "obi", caption: "Hier findest du die Schlüsselkästen" }],
        after: [
          "Die Transporter stehen in der Nähe der Adresse An der Poststraße 63 (ca. 500 m). Die Adresse dient nur zur Orientierung.",
          "Bitte an keiner Haustür klingeln – die Anwohner haben mit der Vermietung nichts zu tun.",
        ],
      },
      {
        title: "Fahrt und Fotos",
        text: ["In der App öffnet sich deine Fahrtseite. Dort kannst du auch die Navigation starten."],
        bullets: [
          "Vor der Fahrt: Fotos vom Kilometerstand und vom Zustand des Fahrzeugs.",
          "Nach der Fahrt: Kilometerstand, Tankbeleg, Zustand außen, Innenraum und Laderaum.",
        ],
        after: ["Die Fotos sind zu deiner Sicherheit. Fehlen sie, muss ein Mitarbeiter das Fahrzeug prüfen. Dafür berechnen wir mindestens 30 €."],
      },
    ],
  },
  en: {
    heading: "How it works",
    intro: "Get your van in 8 simple steps – from booking to return.",
    cta: "Book a van now",
    steps: [
      { title: "Choose the date", text: ["First tap the right button at the top:", "Day rental (3 to 24 hours): tap your day once.", "Several days (more than 24 hours): tap the pick-up day first, then the return day."] },
      { title: "Time and tariff", text: ["Choose the time you want to pick up the van. Then choose your tariff: standard or with more kilometres."] },
      {
        title: "Vehicle and extras",
        text: ["Choose the right vehicle. For each van you can see the cargo volume in cubic metres, the height and the length of the loading area."],
        bullets: [
          "Only driving in town? The LEO MY 102 is limited to 100 km/h – ideal for short trips.",
          "Motorway trip? The PF MY 1003 is more comfortable.",
          "Lots of or long items? Check the length of the loading area.",
        ],
      },
      { title: "Verification", text: ["Take simple photos of your driving licence and ID card (front and back) and upload them."] },
      { title: "Register and pay", text: ["Register with your email and a password you choose yourself. Then pay online."] },
      {
        title: "Key code by email",
        text: ["You receive a booking confirmation and the invoice. 15 minutes before pick-up you get an email with your key code and the number of your key box."],
        videos: [
          { key: "open", caption: "How to open the key box" },
          { key: "close", caption: "How to close it again" },
        ],
      },
      {
        title: "Pick up the key and go to the van",
        text: ["The key boxes are at OBI in Leonberg, in front of the entrance at the bicycle racks."],
        videos: [{ key: "obi", caption: "This is where the key boxes are" }],
        after: [
          "The vans are parked near the address An der Poststraße 63 (approx. 500 m). The address is only for orientation.",
          "Please do not ring any doorbell – the residents have nothing to do with the rental.",
        ],
      },
      {
        title: "Driving and photos",
        text: ["Your trip page opens in the app. You can also start navigation there."],
        bullets: [
          "Before the trip: photos of the mileage and the condition of the vehicle.",
          "After the trip: mileage, fuel receipt, outside condition, interior and cargo area.",
        ],
        after: ["The photos are for your protection. If they are missing, an employee has to check the vehicle. We charge at least €30 for this."],
      },
    ],
  },
  ru: {
    heading: "Как это работает",
    intro: "8 простых шагов до вашего фургона – от бронирования до возврата.",
    cta: "Забронировать фургон",
    steps: [
      { title: "Выберите дату", text: ["Сначала выберите вверху нужную кнопку:", "Аренда на день (от 3 до 24 часов): нажмите один раз на нужный день.", "Несколько дней (больше 24 часов): сначала нажмите на день получения, затем на день возврата."] },
      { title: "Время и тариф", text: ["Выберите, с какого времени вам нужен фургон. Затем выберите тариф: обычный или с большим количеством километров."] },
      {
        title: "Автомобиль и аксессуары",
        text: ["Выберите подходящий автомобиль. У каждого фургона указан объём грузового отсека в кубометрах, высота и длина грузовой площадки."],
        bullets: [
          "Ездите только по городу? LEO MY 102 ограничен скоростью 100 км/ч – идеально для коротких поездок.",
          "Поездка по автобану? На PF MY 1003 удобнее.",
          "Много или длинный груз? Обратите внимание на длину грузовой площадки.",
        ],
      },
      { title: "Проверка документов", text: ["Сделайте простые фото водительского удостоверения и удостоверения личности (с обеих сторон) и загрузите их."] },
      { title: "Регистрация и оплата", text: ["Зарегистрируйтесь с помощью e-mail и собственного пароля. Затем оплатите онлайн."] },
      {
        title: "Код от ключа по e-mail",
        text: ["Вы получите подтверждение бронирования и счёт. За 15 минут до получения придёт письмо с кодом и номером вашего ключевого сейфа."],
        videos: [
          { key: "open", caption: "Как открыть ключевой сейф" },
          { key: "close", caption: "Как закрыть его снова" },
        ],
      },
      {
        title: "Заберите ключ и идите к фургону",
        text: ["Ключевые сейфы находятся у магазина OBI в Леонберге, перед входом у велосипедной стоянки."],
        videos: [{ key: "obi", caption: "Здесь находятся ключевые сейфы" }],
        after: [
          "Фургоны стоят рядом с адресом An der Poststraße 63 (около 500 м). Адрес служит только для ориентира.",
          "Пожалуйста, не звоните ни в какие двери – жители не имеют отношения к аренде.",
        ],
      },
      {
        title: "Поездка и фото",
        text: ["В приложении откроется страница поездки. Там можно также запустить навигацию."],
        bullets: [
          "До поездки: фото пробега и состояния автомобиля.",
          "После поездки: пробег, чек с заправки, состояние снаружи, салон и грузовой отсек.",
        ],
        after: ["Фото нужны для вашей защиты. Если их нет, сотрудник должен проверить автомобиль. За это мы берём не менее 30 €."],
      },
    ],
  },
};

