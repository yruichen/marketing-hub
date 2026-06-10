type Greeting = {
  english: string;
  chinese: string;
  flavor: string;
};

const TIME_SLOTS: Array<{ min: number; max: number; greeting: Greeting }> = [
  {
    min: 5,
    max: 11,
    greeting: {
      english: 'Good morning',
      chinese: '早上好',
      flavor: 'Fresh start. Fresh sparks.',
    },
  },
  {
    min: 11,
    max: 14,
    greeting: {
      english: 'Good noon',
      chinese: '中午好',
      flavor: 'A bright idea is the best lunch break.',
    },
  },
  {
    min: 14,
    max: 18,
    greeting: {
      english: 'Good afternoon',
      chinese: '下午好',
      flavor: 'Momentum is on your side.',
    },
  },
  {
    min: 18,
    max: 23,
    greeting: {
      english: 'Good evening',
      chinese: '晚上好',
      flavor: 'Quiet hours, bold ideas.',
    },
  },
  {
    min: 23,
    max: 30,
    greeting: {
      english: 'Working late',
      chinese: '夜深了',
      flavor: 'The best ideas arrive after midnight.',
    },
  },
];

function pickGreeting(date: Date = new Date()): Greeting {
  const hour = date.getHours();
  return (
    TIME_SLOTS.find((slot) => hour >= slot.min && hour < slot.max)?.greeting ??
    TIME_SLOTS[TIME_SLOTS.length - 1].greeting
  );
}

/**
 * 根据当前时间 + username 生成欢迎语文案。
 * 返回值不带 React 节点，方便在任意位置复用。
 * 切换语言/时区风格只动这一个 hook。
 */
export function useWelcomeLine(username: string): {
  english: string;
  chinese: string;
  flavor: string;
  displayName: string;
} {
  const greeting = pickGreeting();
  const displayName = username?.trim() || 'friend';
  return {
    english: `${greeting.english}, ${displayName}.`,
    chinese: `${greeting.chinese}, ${displayName}。`,
    flavor: greeting.flavor,
    displayName,
  };
}
