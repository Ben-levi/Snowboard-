// Ride page strings (Hebrew, right-to-left). Piste and lift names stay as in OpenStreetMap.
export const t = {
  title: 'פאס דה לה קאסה',
  subtitle: 'גראנדווליירה, אנדורה · שטח אמיתי',
  loading: 'טוענים את ההר…',
  loadFailed: 'לא הצלחנו לטעון את ההר',
  start: 'יאללה לגלוש 🏂',
  speed: 'קמ״ש',
  altitude: 'מ׳',
  airtime: (s) => `אוויר ${s.toFixed(1)} שנ׳ ✈️`,
  crashed: 'אאוץ׳! נפילה 💥',
  backToApp: '→ חזרה לאפליקציה',
  controlsTitle: 'שליטה',
  controls: [
    ['← →  /  A D', 'פנייה (קאנט)'],
    ['↑  /  W', 'כיווץ למהירות · דחיפה במישור'],
    ['↓  /  S', 'בלימה'],
    ['רווח', 'החזיקו לטעינה, שחררו לקפיצה'],
    ['R', 'חזרה לנקודת ההתחלה'],
    ['C', 'מצלמה: מאחור / עיני הרוכב'],
  ],
  credits: 'גובה: AWS Terrain Tiles · מפה: © OpenStreetMap contributors',
};
