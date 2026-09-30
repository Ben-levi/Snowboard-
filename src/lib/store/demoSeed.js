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
    resort: 'ואל תורנס, צרפת',
    dateFrom: from,
    dateTo: to,
    flightOut: 'LY 331 · 06:10 מנתב״ג לז׳נבה',
    flightBack: 'LY 332 · 19:40 מז׳נבה',
    lodging: 'Residence Le Peclet, דירות 12 ו-14',
    meetingPoint: 'טרמינל 3, דלפק אל על, 03:30',
    emergencyContact: 'עומר · 050-1234567',
    notes: 'להביא דרכון ותעודת ביטוח מודפסת.',
  };

  const members = {
    'demo-maya': {
      name: 'מאיה', rider: 'snowboard', color: '#da77f2', groupId: 'demo-flat', createdAt: now, updatedAt: now,
      info: { ...pass, insuranceCompany: 'הפניקס', insurancePolicy: '88-12345', rental: 'לא צריכה', lessons: 'אין' },
      items: {
        helmet: own(true, 'Smith, מידה M'), goggles: own(true), beanie: own(), gaiter: own(),
        'base-top': own(), fleece: own(), jacket: own(false, 'Burton'), gloves: own(true), liners: own(true),
        'base-bottom': own(), pants: own(), socks: own(), 'board-boots': own(false, '39'),
        snowboard: own(false, '147 ס״מ'), bindings: own(), 'wax-kit': own(true), backpack: own(true),
        sunscreen: own(), 'lip-balm': own(), warmers: need('buy'),
      },
    },
    'demo-omer': {
      name: 'עומר', rider: 'ski', color: '#4dabf7', groupId: 'demo-car', createdAt: now + 1, updatedAt: now,
      info: { ...pass, insuranceCompany: 'הראל', rental: 'Skiset, ליד המעלית' },
      items: {
        helmet: own(true), goggles: own(), jacket: own(), pants: own(true, 'מידה L'), gloves: own(),
        'ski-boots': own(false, 'מונדו 28.5'), skis: own(true, '170 ס״מ'), poles: own(true), socks: own(),
        'base-top': need('buy'), 'base-bottom': need('buy'), fleece: need('borrow'), gaiter: need('buy'),
      },
    },
    'demo-noa': {
      name: 'נועה', rider: 'snowboard', color: '#69db7c', groupId: 'demo-flat', createdAt: now + 2, updatedAt: now,
      info: { ...pass, instructor: 'ז׳ול', instructorPhone: '+33 6 12 34 56 78', lessons: '3 בקרים, 09:00-12:00' },
      items: {
        beanie: own(true), 'base-top': own(), 'base-bottom': own(), socks: own(true), sunscreen: own(true),
        jacket: own(), fleece: own(true), helmet: need('borrow'), goggles: need('borrow'),
        snowboard: need('borrow'), bindings: need('borrow'), 'board-boots': need('buy'),
        pants: need('buy'), gloves: need('buy'), 'impact-shorts': need('skip'),
      },
    },
    'demo-ido': {
      name: 'עידו', rider: 'ski', color: '#ffa94d', groupId: 'demo-car', createdAt: now + 3, updatedAt: now,
      info: {},
      items: {
        jacket: own(true), 'base-top': own(), fleece: own(true), pants: own(), bottle: own(),
        skis: need('borrow'), poles: need('borrow'), 'ski-boots': need('buy'), helmet: need('buy'),
        goggles: need('buy'), gloves: need('buy'), socks: need('buy'),
      },
    },
  };

  const item = (label, status, by, i) => ({ label, status, by, createdAt: now + i });
  const groups = {
    'demo-flat': {
      name: 'דירה 12', emoji: '🏠', createdAt: now, updatedAt: now,
      items: {
        f1: item('קפה ומקינטה', 'have', 'demo-maya', 1),
        f2: item('רמקול', 'have', 'demo-noa', 2),
        f3: item('תבלינים ושמן', 'buy', null, 3),
        f4: item('משחק קלפים', 'buy', null, 4),
      },
    },
    'demo-car': {
      name: 'רכב 2', emoji: '🚗', createdAt: now + 1, updatedAt: now,
      items: {
        c1: item('שרשראות שלג', 'buy', 'demo-omer', 1),
        c2: item('מטען לפלאפון', 'have', 'demo-ido', 2),
        c3: item('גרדן לשמשה', 'buy', null, 3),
      },
    },
  };

  const messages = {
    welcome: {
      text: 'ברוכים הבאים לטיול! 🏔️ מלאו סקי פס וביטוח בפרטים שלכם, וסמנו מה יש לכם בציוד.',
      pinned: true, createdAt: now, updatedAt: now,
    },
    rental: {
      text: 'מי שצריך השכרת ציוד: לעדכן אותי עד סוף החודש כדי שנזמין מראש בהנחה.',
      pinned: false, createdAt: now - 60 * 60 * 1000, updatedAt: now,
    },
  };

  return { info, members, groups, messages };
}
