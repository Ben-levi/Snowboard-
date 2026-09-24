// Sample crew so demo mode has something to look at on first load.
const own = (lendable = false, note = '') => ({ status: 'own', note, lendable, borrowedFrom: null, lentTo: null });
const need = (status) => ({ status, note: '', lendable: false, borrowedFrom: null, lentTo: null });

export function seedDemoMembers() {
  const now = Date.now();
  return {
    'demo-maya': {
      name: 'Maya', rider: 'snowboard', color: '#da77f2', createdAt: now, updatedAt: now,
      items: {
        helmet: own(true, 'Smith, size M'), goggles: own(true), beanie: own(), gaiter: own(),
        'base-top': own(), fleece: own(), jacket: own(false, 'Burton'), gloves: own(true), liners: own(true),
        'base-bottom': own(), pants: own(), socks: own(), 'board-boots': own(false, 'EU 39'),
        snowboard: own(false, '147cm'), bindings: own(), 'wax-kit': own(true), backpack: own(true),
        sunscreen: own(), 'lip-balm': own(), warmers: need('buy'),
      },
    },
    'demo-omer': {
      name: 'Omer', rider: 'ski', color: '#4dabf7', createdAt: now, updatedAt: now,
      items: {
        helmet: own(true), goggles: own(), jacket: own(), pants: own(true, 'size L'), gloves: own(),
        'ski-boots': own(false, 'Mondo 28.5'), skis: own(true, '170cm'), poles: own(true), socks: own(),
        'base-top': need('buy'), 'base-bottom': need('buy'), fleece: need('borrow'), gaiter: need('buy'),
      },
    },
    'demo-noa': {
      name: 'Noa', rider: 'snowboard', color: '#69db7c', createdAt: now, updatedAt: now,
      items: {
        beanie: own(true), 'base-top': own(), 'base-bottom': own(), socks: own(true), sunscreen: own(true),
        jacket: own(), fleece: own(true), helmet: need('borrow'), goggles: need('borrow'),
        snowboard: need('borrow'), bindings: need('borrow'), 'board-boots': need('buy'),
        pants: need('buy'), gloves: need('buy'), 'impact-shorts': need('skip'),
      },
    },
    'demo-ido': {
      name: 'Ido', rider: 'ski', color: '#ffa94d', createdAt: now, updatedAt: now,
      items: {
        jacket: own(true), 'base-top': own(), fleece: own(true), pants: own(), bottle: own(),
        skis: need('borrow'), poles: need('borrow'), 'ski-boots': need('buy'), helmet: need('buy'),
        goggles: need('buy'), gloves: need('buy'), socks: need('buy'),
      },
    },
  };
}
