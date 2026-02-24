export type RecoveryInsight = {
  title: string;
  body: string;
};

type InsightRange = {
  min: number;
  max: number | null;
  insight: RecoveryInsight;
};

const INSIGHT_TABLE: InsightRange[] = [
  {
    min: 0,
    max: 3,
    insight: {
      title: "Stabilizing the first days",
      body: "Sleep and appetite can be uneven early on. Hydration, short walks, and structure often reduce stress.",
    },
  },
  {
    min: 4,
    max: 7,
    insight: {
      title: "First-week momentum",
      body: "Cravings may still spike in waves. It is common for mood to shift quickly while routines begin to hold.",
    },
  },
  {
    min: 8,
    max: 14,
    insight: {
      title: "Early rhythm",
      body: "Many people notice steadier mornings around this window. Sleep quality often starts improving with consistency.",
    },
  },
  {
    min: 15,
    max: 21,
    insight: {
      title: "Week-three adjustment",
      body: "Dopamine signaling may begin to rebalance. Energy and focus can improve when meals and meetings stay regular.",
    },
  },
  {
    min: 22,
    max: 30,
    insight: {
      title: "One-month checkpoint",
      body: "Emotional swings often soften by this stage. Ongoing support still matters because triggers can return unexpectedly.",
    },
  },
  {
    min: 31,
    max: 60,
    insight: {
      title: "Building durable habits",
      body: "Common gains include steadier appetite, better concentration, and clearer sleep cycles. Routines protect progress.",
    },
  },
  {
    min: 61,
    max: 90,
    insight: {
      title: "Foundation phase",
      body: "This period often locks in identity-level change. Meetings, sponsor contact, and recovery planning stay high value.",
    },
  },
  {
    min: 91,
    max: null,
    insight: {
      title: "Long-run consistency",
      body: "Long-term recovery is usually driven by repeatable daily systems. Relapse prevention plans remain important.",
    },
  },
];

export function getInsightForDay(daysSober: number): RecoveryInsight {
  const normalized = Math.max(0, Math.floor(daysSober));
  const range = INSIGHT_TABLE.find(
    (entry) => normalized >= entry.min && (entry.max === null || normalized <= entry.max),
  );
  return (
    range?.insight ?? {
      title: "Keep going",
      body: "Progress can be gradual. Consistent actions often matter more than perfect days.",
    }
  );
}

export const PHYSICAL_RECOVERY_COPY =
  "Months 4-6: Deep healing\n\n" +
  "After four to six months sober, your body undertakes deeper repairs.\n\n" +
  "By about 4-6 months, if you had alcohol-related fatty liver or mild hepatitis, much of it may reverse with abstinence. [11] Additionally, your liver cells regenerate and return to near-normal function. Your immune system also bounces back. Just after six months, people report getting sick less frequently because alcohol's immune-suppressing effects have faded. [2]\n\n" +
  'Mentally, your focus and memory continue to sharpen, and any lingering anxiety is much improved compared to early sobriety. Each alcohol-free month in this phase makes you feel healthier and more "yourself."';
