// The popular runs of Pas de la Casa and Grau Roig, as described by guides and riders
// (Neilson, Ski Club GB, j2ski, Grandvalira). `osm` is the piste name in OpenStreetMap.
// tier: 0 open from the start, 1 needs RED_STARS, 2 needs BLACK_STARS, 'bx' needs BX_STARS.

export const UNLOCK = { 0: 0, 1: 3, 2: 9, bx: 5 };

export const RUNS = [
  {
    osm: 'Pista Escola',
    tier: 0,
    width: 40,
    lift: 'TLC Les Abelletes',
    blurb: 'מסלול הלימוד בבסיס פאס דה לה קאסה: רחב, מתון ובטוח לסיבובים הראשונים.',
  },
  {
    osm: 'Isards',
    tier: 0,
    width: 30,
    lift: 'TK Pic Negre 1',
    blurb: 'כחולה קלה מעל העיירה עם נוף פתוח לעמק הצרפתי.',
  },
  {
    osm: 'Tubs',
    tier: 0,
    width: 42,
    lift: 'TSF4 La Solana',
    blurb: 'הכחולה הרחבה של פאס, מושלמת לתרגול קארבינג. בערבים זה מסלול הגלישה הלילית.',
  },
  {
    osm: 'Cami de Pessons',
    tier: 0,
    width: 22,
    lift: 'TSD4 Cubil',
    blurb: 'כחולה ארוכה, צרה ונופית: עוברת ליד אגם פסונס ויורדת עד בסיס גראו רויג.',
  },
  {
    osm: 'Pastora',
    tier: 0,
    width: 30,
    lift: 'TSD4 Les Antenes',
    blurb: 'קרוזר כחול של 2.2 ק״מ, מלמעלה ועד בסיס גראו רויג.',
  },
  {
    osm: 'Pista Llarga',
    tier: 1,
    width: 34,
    lift: 'TSD6 Pic Blanc',
    blurb: 'האדומה הארוכה של גראו רויג: 2.16 ק״מ מגובה 2,623 מ׳ ליד קול בלאן. השליש העליון והתחתון תלולים, מישור באמצע.',
  },
  {
    osm: 'Directa I',
    tier: 1,
    width: 32,
    lift: 'TSD6 Font Negre',
    blurb: 'אדומה קלאסית מראש פונט נגרה ישר אל העיירה, 460 מ׳ ירידה.',
  },
  {
    osm: 'Montmalús',
    tier: 1,
    width: 30,
    lift: 'TK Montmalús',
    blurb: 'אדומה שקטה בדרך כלל, דרך נוף פראי ובחזרה לגראו רויג.',
  },
  {
    osm: 'Moreto',
    tier: 1,
    width: 36,
    lift: 'TSD4 Cubil',
    blurb: 'אדומה מפתיעה: רחבה ונוחה למעלה, ואז כמה קטעים תלולים באמת.',
  },
  {
    osm: 'Mirador',
    tier: 2,
    width: 36,
    lift: 'TSD4 Cubil',
    blurb: 'השחורה ה״נינוחה״: רחבה ונעימה, אבל הקטע האחרון קשוח.',
  },
  {
    osm: 'Jordi Angles',
    tier: 2,
    width: 28,
    lift: 'TSD6 Font Negre',
    blurb: 'שחורה תלולה ומאתגרת מראש פונט נגרה עד תחתית העיירה.',
  },
  {
    osm: 'Granota',
    tier: 2,
    width: 26,
    lift: 'TK Montmalús',
    blurb: 'שחורה מימין לרכבל מונטמאלוס. כדאי לבדוק את מצב השלג לפני.',
  },
  {
    osm: 'Boardercross Tubs',
    tier: 'bx',
    width: 14,
    lift: 'TSD4 Pas de la Casa',
    boardercross: true,
    blurb: 'מסלול הבורדרקרוס של פאס: גלים, פניות מוגבהות ומהירות.',
  },
];

// Attach the curated info to the courses built from OSM, in the curated order.
export function curateCourses(courses) {
  const byName = new Map(courses.map((c) => [c.name, c]));
  return RUNS.flatMap((r) => {
    const c = byName.get(r.osm);
    return c ? [{ ...c, ...r, id: c.id, name: c.name }] : [];
  });
}
