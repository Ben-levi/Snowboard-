// Sample crew so demo mode has something to look at on first load.
const own = (lendable = false, note = '') => ({ status: 'own', note, lendable, borrowedFrom: null, lentTo: null });
const need = (status) => ({ status, note: '', lendable: false, borrowedFrom: null, lentTo: null });

const DAY = 24 * 60 * 60 * 1000;
const day = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function seedDemoTrip(now = Date.now()) {
  const from = day(now + 24 * DAY);
  const to = day(now + 31 * DAY);
  const pass = { skiPassFrom: day(now + 25 * DAY), skiPassTo: day(now + 30 * DAY), skiPassType: '6 ימים, כל העמק' };

  const info = {
    resort: 'פאס דה לה קאסה, אנדורה',
    dateFrom: from,
    dateTo: to,
    lodging: 'Apartaments Font, דירות 12 ו-14',
    meetingPoint: 'טרמינל 3, ליד דלפק אל על, 03:30',
    emergencyContact: 'עומר · 050-1234567',
    notes: 'הסעה מברצלונה לאנדורה יוצאת 11:30 מטרמינל 1 (כ-3 שעות).',
    flights: [
      { id: 'fl-out', number: 'LY 395', date: from, time: '06:10', arrive: '09:55', from: 'TLV', to: 'BCN', who: ['demo-maya', 'demo-omer', 'demo-noa'] },
      { id: 'fl-out2', number: 'VY 7843', date: from, time: '10:45', arrive: '14:35', from: 'TLV', to: 'BCN', who: ['demo-ido'] },
      { id: 'fl-back', number: 'LY 396', date: to, time: '19:40', arrive: '00:45', from: 'BCN', to: 'TLV', who: ['demo-maya', 'demo-omer', 'demo-noa', 'demo-ido'] },
    ],
  };

  const members = {
    'demo-maya': {
      name: 'מאיה', rider: 'snowboard', color: '#da77f2', createdAt: now, updatedAt: now,
      info: { ...pass, phone: '052-7654321', room: 'דירה 12', insuranceCompany: 'הפניקס', insurancePolicy: '88-12345', rental: 'לא צריכה' },
      items: {
        helmet: own(true, 'Smith, מידה M'), goggles: own(true), beanie: own(), gaiter: own(),
        'base-top': own(), fleece: own(), jacket: own(false, 'Burton'), gloves: own(true), liners: own(true),
        'base-bottom': own(), pants: own(), socks: own(), 'board-boots': own(false, '39'),
        snowboard: own(false, '147 ס״מ'), bindings: own(), 'wax-kit': own(true), backpack: own(true),
        sunscreen: own(), 'lip-balm': own(), warmers: need('buy'),
      },
    },
    'demo-omer': {
      name: 'עומר', rider: 'ski', color: '#4dabf7', createdAt: now + 1, updatedAt: now,
      info: { ...pass, phone: '050-1234567', room: 'דירה 14', insuranceCompany: 'הראל', rental: 'Skiset, ליד הרכבל', shoeSize: '44', height: '182', weight: '80' },
      items: {
        helmet: own(true), goggles: own(), jacket: own(), pants: own(true, 'מידה L'), gloves: own(),
        'ski-boots': own(false, 'מונדו 28.5'), skis: own(true, '170 ס״מ'), poles: own(true), socks: own(),
        'base-top': need('buy'), 'base-bottom': need('buy'), fleece: need('borrow'), gaiter: need('buy'),
      },
    },
    'demo-noa': {
      name: 'נועה', rider: 'snowboard', color: '#69db7c', createdAt: now + 2, updatedAt: now,
      info: { ...pass, phone: '054-1112233', room: 'דירה 12', rental: 'בורד ונעליים, Skiset', shoeSize: '38', height: '165', instructor: 'ז׳ורדי', instructorPhone: '+376 612 345', lessons: '3 בקרים, 09:00-12:00', notes: 'אלרגיה לאגוזים' },
      items: {
        beanie: own(true), 'base-top': own(), 'base-bottom': own(), socks: own(true), sunscreen: own(true),
        jacket: own(), fleece: own(true), helmet: need('borrow'), goggles: need('borrow'),
        snowboard: need('borrow'), bindings: need('borrow'), 'board-boots': need('buy'),
        pants: need('buy'), gloves: need('buy'), 'impact-shorts': need('skip'),
      },
    },
    'demo-ido': {
      name: 'עידו', rider: 'ski', color: '#ffa94d', createdAt: now + 3, updatedAt: now,
      info: { phone: '053-9998877', room: 'דירה 14' },
      items: {
        jacket: own(true), 'base-top': own(), fleece: own(true), pants: own(), bottle: own(),
        skis: need('borrow'), poles: need('borrow'), 'ski-boots': need('buy'), helmet: need('buy'),
        goggles: need('buy'), gloves: need('buy'), socks: need('buy'),
      },
    },
  };

  const item = (label, done, by, i, note = '') => ({ label, done, by, note, createdAt: now + i });
  const groups = {
    'demo-docs': {
      name: 'מסמכים', emoji: '', createdAt: now, updatedAt: now,
      items: {
        d1: item('דרכונים בתוקף (6 חודשים)', true, null, 1),
        d2: item('ביטוח נסיעות מודפס', false, null, 2, 'כל אחד לעצמו'),
        d3: item('אישור הזמנת דירות', true, 'demo-omer', 3, 'שמור גם בוואטסאפ'),
        d4: item('הזמנת הסעה מברצלונה', false, 'demo-omer', 4),
      },
    },
    'demo-flat': {
      name: 'דירה', emoji: '', createdAt: now + 1, updatedAt: now,
      items: {
        f1: item('קפה ומקינטה', true, 'demo-maya', 1),
        f2: item('רמקול', false, 'demo-noa', 2),
        f3: item('תבלינים ושמן', false, null, 3),
        f4: item('משחק קלפים', false, null, 4),
      },
    },
    'demo-shared': {
      name: 'ציוד משותף', emoji: '', createdAt: now + 2, updatedAt: now,
      items: {
        s1: item('ערכת ווקס', true, 'demo-maya', 1),
        s2: item('מתאם חשמל (תקע אירופאי)', false, 'demo-ido', 2, 'לפחות 2'),
        s3: item('ערכת עזרה ראשונה', false, null, 3),
      },
    },
  };

  const messages = {
    welcome: {
      text: 'מלאו בפרטים שלכם טלפון, סקי פס ומידות להשכרה, וסמנו באיזו טיסה אתם.',
      pinned: true, createdAt: now, updatedAt: now,
    },
    rental: {
      text: 'מי שצריך השכרת ציוד: לעדכן אותי עד סוף החודש כדי שנזמין מראש בהנחה.',
      pinned: false, by: 'demo-omer', createdAt: now - 60 * 60 * 1000, updatedAt: now,
    },
  };

  return { info, members, groups, messages };
}
