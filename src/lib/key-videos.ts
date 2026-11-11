/**
 * Zentrale Quelle für die Schlüssel-Videos (Standort OBI + Bedienung Schlüsselkasten).
 * Genutzt von /so-funktionierts (Anker), Buchungsbestätigungen (HTML + Text) und Schlüssel-SMS.
 * Mails verlinken nur Vorschaubilder, keine eingebetteten Player.
 */
import openVideo from "@/assets/schluesselkasten-oeffnen.mp4.asset.json";
import openPoster from "@/assets/schluesselkasten-oeffnen-poster.jpg.asset.json";
import closeVideo from "@/assets/schluesselkasten-schliessen.mp4.asset.json";
import closePoster from "@/assets/schluesselkasten-schliessen-poster.jpg.asset.json";
import obiVideo from "@/assets/schluesselkasten-obi.mp4.asset.json";
import obiPoster from "@/assets/schluesselkasten-obi-poster.jpg.asset.json";

export const SITE_ORIGIN = "https://mytransporter.org";
export const HOW_IT_WORKS_PATH = "/so-funktionierts";

/** Stabile Anker auf /so-funktionierts – nicht umbenennen, alte Mails/SMS verlinken darauf. */
export const KEY_VIDEO_ANCHORS = {
  videos: "schluessel-videos",
  standort: "schluessel-standort",
  bedienung: "schluessel-bedienung",
} as const;

export type KeyVideoKey = "open" | "close" | "obi";

/** Relative Asset-URLs für die Website. */
export const KEY_VIDEO_ASSETS: Record<KeyVideoKey, { src: string; poster: string }> = {
  open: { src: openVideo.url, poster: openPoster.url },
  close: { src: closeVideo.url, poster: closePoster.url },
  obi: { src: obiVideo.url, poster: obiPoster.url },
};

const abs = (u: string) => (/^https?:\/\//.test(u) ? u : `${SITE_ORIGIN}${u}`);

/** Kurzer Link für die SMS (ohne https, zeigt beide Videos direkt hintereinander). */
export const KEY_VIDEOS_SHORT_LINK = `mytransporter.org${HOW_IT_WORKS_PATH}#${KEY_VIDEO_ANCHORS.videos}`;

/** Die zwei Videos für Bestätigungsmails: (1) Standort OBI, (2) Bedienung Schlüsselkasten. */
export const KEY_VIDEO_LINKS = [
  {
    key: "obi" as const,
    title: "Video 1: Hier findest du den Schlüsselkasten am OBI Leonberg",
    pageUrl: `${SITE_ORIGIN}${HOW_IT_WORKS_PATH}#${KEY_VIDEO_ANCHORS.standort}`,
    videoUrl: abs(obiVideo.url),
    posterUrl: abs(obiPoster.url),
  },
  {
    key: "open" as const,
    title: "Video 2: So öffnest du den Schlüsselkasten",
    pageUrl: `${SITE_ORIGIN}${HOW_IT_WORKS_PATH}#${KEY_VIDEO_ANCHORS.bedienung}`,
    videoUrl: abs(openVideo.url),
    posterUrl: abs(openPoster.url),
  },
];

export const KEY_VIDEO_HINT =
  "Wichtig: Bitte schau dir vor der Abholung diese zwei kurzen Videos an. Sie zeigen, wo der Schlüsselkasten am OBI Leonberg hängt und wie du ihn bedienst.";

const escAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Mail-kompatibler Block: verlinkte Vorschaubilder + klare Textlinks als Fallback. */
export function keyVideosHtml(): string {
  const cells = KEY_VIDEO_LINKS.map(
    (v) => `<td valign="top" width="50%" style="padding:6px;text-align:center;">
      <a href="${escAttr(v.pageUrl)}" style="text-decoration:none;color:#000;">
        <img src="${escAttr(v.posterUrl)}" width="160" alt="${escAttr(v.title)}" style="display:block;margin:0 auto 8px;width:160px;max-width:100%;height:auto;border:0;border-radius:10px;" />
      </a>
      <a href="${escAttr(v.pageUrl)}" style="color:#000;font-weight:bold;font-size:14px;">▶ ${escAttr(v.title)}</a>
    </td>`,
  ).join("");
  return `<div style="margin:18px 0;padding:14px;border:2px solid #000;border-radius:14px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
    <p style="margin:0 0 10px;font-size:15px;line-height:1.5;color:#000;"><strong>${escAttr(KEY_VIDEO_HINT)}</strong></p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>
    <p style="margin:10px 0 0;font-size:12px;color:#555;">Bilder werden nicht angezeigt? Hier direkt öffnen: ${KEY_VIDEO_LINKS.map((v) => `<a href="${escAttr(v.videoUrl)}" style="color:#000;">${escAttr(v.title)}</a>`).join(" · ")}</p>
  </div>`;
}

/** Plaintext-Variante für Mails. */
export function keyVideosText(): string[] {
  return [KEY_VIDEO_HINT, ...KEY_VIDEO_LINKS.map((v) => `${v.title}: ${v.pageUrl}`)];
}
