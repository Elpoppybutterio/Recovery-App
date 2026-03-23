import { getDaysSober } from "./recoveryMilestones";

export type RecoverySubstanceCategory =
  | "ALCOHOL"
  | "OPIOIDS"
  | "METH_STIMULANTS"
  | "MARIJUANA"
  | "KRATOM";

export type RecoveryInsightKind = "MENTAL" | "PHYSICAL";

type RecoveryCurvePoint = {
  day: number;
  percent: number;
};

type RecoveryBandMeta = {
  id: string;
  label: string;
  weekStart: number;
  weekEnd: number | null;
};

type RecoveryBandContent = {
  headline: string;
  improving: string[];
  stillPossible: string[];
  expectations: string[];
  encouragement: string;
};

type RecoveryTrackDefinition = {
  curve: RecoveryCurvePoint[];
  bands: RecoveryBandContent[];
};

type RecoverySubstanceDefinition = {
  label: string;
  shortLabel: string;
  tracks: Record<RecoveryInsightKind, RecoveryTrackDefinition>;
};

type SubstanceTrackProgress = {
  substance: RecoverySubstanceCategory;
  substanceLabel: string;
  percent: number;
  weekNumber: number;
  bandMeta: RecoveryBandMeta;
  bandContent: RecoveryBandContent;
};

export type RecoveryGaugeTileSummary = {
  kind: RecoveryInsightKind;
  label: string;
  hasProfile: boolean;
  percent: number | null;
  weekNumber: number;
  selectedSubstance: RecoverySubstanceCategory | null;
  selectedSubstanceLabel: string | null;
  summaryLine: string;
  supportiveLine: string;
  educationalNote: string;
};

export type RecoveryDashboardViewModel = {
  hasProfile: boolean;
  daysSober: number;
  weekNumber: number;
  selectedSubstances: RecoverySubstanceCategory[];
  gauges: Record<RecoveryInsightKind, RecoveryGaugeTileSummary>;
};

export type RecoveryInsightDetailViewModel = {
  kind: RecoveryInsightKind;
  label: string;
  hasProfile: boolean;
  daysSober: number;
  weekNumber: number;
  percent: number | null;
  percentLabel: string;
  selectedSubstance: RecoverySubstanceCategory | null;
  selectedSubstanceLabel: string | null;
  substanceOptions: Array<{
    value: RecoverySubstanceCategory;
    label: string;
  }>;
  snapshot: string;
  trendLine: string;
  whatMayBeImproving: string[];
  whatMayStillOccur: string[];
  whatToExpect: string[];
  encouragement: string;
  educationalNote: string;
  emptyStateTitle: string;
  emptyStateBody: string;
};

const EDUCATIONAL_NOTE =
  "Educational estimate only, not a diagnosis or guarantee. Healing trends vary by person, health history, treatment, sleep, nutrition, and stress load.";

const RECOVERY_BANDS: RecoveryBandMeta[] = [
  { id: "week-1", label: "Week 1", weekStart: 1, weekEnd: 1 },
  { id: "weeks-2-4", label: "Weeks 2-4", weekStart: 2, weekEnd: 4 },
  { id: "weeks-5-8", label: "Weeks 5-8", weekStart: 5, weekEnd: 8 },
  { id: "weeks-9-12", label: "Weeks 9-12", weekStart: 9, weekEnd: 12 },
  { id: "months-4-6", label: "Months 4-6", weekStart: 13, weekEnd: 24 },
  { id: "months-6-plus", label: "Months 6+", weekStart: 25, weekEnd: null },
];

export const RECOVERY_SUBSTANCE_OPTIONS: Array<{
  value: RecoverySubstanceCategory;
  label: string;
}> = [
  { value: "ALCOHOL", label: "Alcohol" },
  { value: "OPIOIDS", label: "Opioids" },
  { value: "METH_STIMULANTS", label: "Meth / stimulants" },
  { value: "MARIJUANA", label: "Marijuana" },
  { value: "KRATOM", label: "Kratom" },
];

const RECOVERY_LIBRARY: Record<RecoverySubstanceCategory, RecoverySubstanceDefinition> = {
  ALCOHOL: {
    label: "Alcohol",
    shortLabel: "Alcohol",
    tracks: {
      PHYSICAL: {
        curve: [
          { day: 0, percent: 10 },
          { day: 7, percent: 32 },
          { day: 30, percent: 55 },
          { day: 90, percent: 76 },
          { day: 180, percent: 88 },
          { day: 365, percent: 96 },
        ],
        bands: [
          {
            headline: "Your body is settling after the first sharp shift away from alcohol.",
            improving: [
              "Hydration, blood sugar balance, and stress load may begin stabilizing hour by hour.",
              "Morning clarity can start returning in short but meaningful windows.",
            ],
            stillPossible: [
              "Sleep disruption, sweating, shakiness, and irritability can still feel intense.",
              "Energy may bounce between drained and restless.",
            ],
            expectations: [
              "This week is usually about stabilization more than comfort.",
              "Small wins like meals, fluids, and rest still count as recovery progress.",
            ],
            encouragement:
              "A rough first week does not mean you are doing recovery wrong. Your body is working hard in your favor.",
          },
          {
            headline: "Steadier mornings and fewer physical swings often start showing up here.",
            improving: [
              "Sleep rhythm may start feeling less chaotic.",
              "Appetite, digestion, and daily energy can become more predictable.",
            ],
            stillPossible: [
              "Cravings, headaches, and sudden irritability may still visit.",
              "Some days can feel better than the next even when healing is real.",
            ],
            expectations: [
              "Recovery can feel uneven while your body keeps rebalancing in the background.",
              "Consistency with meals, water, and routines usually pays off this month.",
            ],
            encouragement:
              "You may not feel fully repaired yet, but your baseline is often stronger now than it was in the first week.",
          },
          {
            headline:
              "Physical repair usually feels more durable, even if stress still exposes weak spots.",
            improving: [
              "Sleep quality and daily stamina may hold longer through the day.",
              "Inflammation, digestion, and stress recovery often keep trending upward.",
            ],
            stillPossible: [
              "Stress can still hit hard and make healing feel slower than it is.",
              "You may feel physically better before emotional confidence fully catches up.",
            ],
            expectations: [
              "This is often the stage where your body feels more trustworthy again.",
              "Progress may look less dramatic now, but it is often more durable.",
            ],
            encouragement:
              "Quiet progress is still progress. The work you repeat here tends to stick.",
          },
          {
            headline:
              "Your physical systems are often moving from recovery mode into resilience mode.",
            improving: [
              "Stamina, stress tolerance, and immune resilience may continue climbing.",
              "Sleep and recovery after stressful days can feel more normal again.",
            ],
            stillPossible: [
              "Hard weeks may still bring fatigue or cravings back into view.",
              "Progress can feel subtle because fewer symptoms are dominating your attention.",
            ],
            expectations: [
              "The pace often slows here, but the foundation keeps strengthening.",
              "Good routines still compound in this phase.",
            ],
            encouragement:
              "This is often where your body starts feeling like an ally again instead of a crisis zone.",
          },
          {
            headline:
              "Longer-term physical healing often feels steadier, calmer, and easier to maintain.",
            improving: [
              "Stress recovery, sleep depth, and everyday endurance may continue sharpening.",
              "You may notice fewer extreme rebounds after hard days.",
            ],
            stillPossible: [
              "Heavy stress, poor sleep, or illness can still make old symptoms feel temporarily louder.",
              "A flat week does not erase the healing already built.",
            ],
            expectations: [
              "Improvements may feel gradual now rather than dramatic.",
              "The goal shifts from repairing damage to protecting the healthy baseline you have built.",
            ],
            encouragement:
              "Your body often keeps rewarding steady recovery long after the crisis phase ends.",
          },
          {
            headline:
              "Alcohol-related physical recovery can keep deepening through maintenance and stability.",
            improving: [
              "Energy management and physical resilience often keep improving with routine.",
              "The body usually responds well to continued rest, movement, and structure.",
            ],
            stillPossible: [
              "Stress spikes can still wake up old vulnerabilities.",
              "You may occasionally feel surprised by how much structure still matters.",
            ],
            expectations: [
              "Long-term healing is often less about rescue and more about protection.",
              "Stable habits keep preserving the ground you have recovered.",
            ],
            encouragement:
              "You are not just getting through recovery now. You are learning how to keep it.",
          },
        ],
      },
      MENTAL: {
        curve: [
          { day: 0, percent: 8 },
          { day: 7, percent: 18 },
          { day: 30, percent: 38 },
          { day: 90, percent: 63 },
          { day: 180, percent: 79 },
          { day: 365, percent: 92 },
        ],
        bands: [
          {
            headline: "Your brain is beginning the first stage of rebalancing after alcohol.",
            improving: [
              "Attention and mental clarity may flicker back in short stretches.",
              "The nervous system is starting to calm, even if it does not feel calm yet.",
            ],
            stillPossible: [
              "Anxiety, racing thoughts, guilt, irritability, or vivid dreams can still feel loud.",
              "Motivation may be inconsistent from one part of the day to the next.",
            ],
            expectations: [
              "Week 1 is often more about safety and stabilization than feeling mentally sharp.",
              "Mental relief can lag behind the decision to stop drinking.",
            ],
            encouragement:
              "Your mind can feel noisy while it heals. That noise is not proof that you are stuck.",
          },
          {
            headline: "Mental fog may begin lifting in waves, even if emotions still run hot.",
            improving: [
              "Focus and short-term memory may feel a little more reliable.",
              "You may start catching impulses before acting on them.",
            ],
            stillPossible: [
              "Low frustration tolerance, sleep-related mood swings, and cravings can still show up.",
              "You may feel better mentally one day and flat the next.",
            ],
            expectations: [
              "Emotional steadiness often improves more slowly than physical comfort.",
              "The brain usually benefits from repetition, low chaos, and a predictable routine.",
            ],
            encouragement:
              "More stable thinking often arrives in layers. Needing patience here is normal.",
          },
          {
            headline:
              "Mental repair often becomes more noticeable as attention and emotional range widen.",
            improving: [
              "Decision-making and concentration may feel less fragile.",
              "You may notice better follow-through and fewer mental crashes.",
            ],
            stillPossible: [
              "Stress, shame, or old triggers may still distort how much progress you think you have made.",
              "Sleep disturbance or irritability can still echo in the background.",
            ],
            expectations: [
              "This stage often feels more mentally capable, but still not fully settled.",
              "Your recovery voice may get stronger even when cravings still appear.",
            ],
            encouragement:
              "Thinking more clearly does not mean everything is fixed. It means you have more tools available now.",
          },
          {
            headline:
              "Mental resilience usually starts feeling steadier and less borrowed from willpower alone.",
            improving: [
              "Mood swings may soften and recovery choices can feel less forced.",
              "Memory, follow-through, and stress recovery often keep improving.",
            ],
            stillPossible: [
              "Emotional numbness, impatience, or surprise triggers can still happen.",
              "Some people feel confused when progress is real but less dramatic.",
            ],
            expectations: [
              "The middle months are often about depth, not novelty.",
              "You may be learning how to live differently, not just abstain differently.",
            ],
            encouragement:
              "This quieter phase is often where real mental stability starts becoming your default.",
          },
          {
            headline:
              "Mental recovery often feels more integrated, with clearer thinking under normal stress.",
            improving: [
              "Attention, recall, and emotional steadiness may keep strengthening.",
              "You may trust your routines more because they keep working under pressure.",
            ],
            stillPossible: [
              "Hard life events can still flare up cravings or distorted thinking.",
              "You may still have tender spots even with strong overall progress.",
            ],
            expectations: [
              "Growth is usually less about speed now and more about staying power.",
              "Healthy repetition matters more than dramatic breakthroughs in this phase.",
            ],
            encouragement:
              "You are building a mind that can recover from stress more cleanly, not just a mind that avoids alcohol.",
          },
          {
            headline:
              "Long-term alcohol recovery often supports deeper emotional range and clearer self-trust.",
            improving: [
              "Recovery thinking can feel more natural and less forced.",
              "You may notice stronger patience, perspective, and emotional flexibility.",
            ],
            stillPossible: [
              "Old patterns can still surface during major stress or isolation.",
              "A hard day can still feel discouraging even after substantial healing.",
            ],
            expectations: [
              "Maintenance matters because recovery stays active, even when it is familiar.",
              "Long-term healing often means faster returns to center after disruption.",
            ],
            encouragement:
              "A steadier mind is often built one ordinary day at a time. That still counts as profound progress.",
          },
        ],
      },
    },
  },
  OPIOIDS: {
    label: "Opioids",
    shortLabel: "Opioids",
    tracks: {
      PHYSICAL: {
        curve: [
          { day: 0, percent: 6 },
          { day: 7, percent: 20 },
          { day: 30, percent: 42 },
          { day: 90, percent: 65 },
          { day: 180, percent: 80 },
          { day: 365, percent: 90 },
        ],
        bands: [
          {
            headline: "Your body is beginning a hard recalibration after opioid dependence.",
            improving: [
              "Acute withdrawal intensity may start easing from its peak.",
              "Hydration, temperature regulation, and sleep pressure may slowly start normalizing.",
            ],
            stillPossible: [
              "Body aches, gut disruption, chills, sweating, and intense exhaustion may still be active.",
              "Sleep may feel light, short, or nearly absent for stretches.",
            ],
            expectations: [
              "The first week can be physically punishing even when progress is real.",
              "Relief often arrives in uneven bursts rather than a clean line.",
            ],
            encouragement:
              "The discomfort can be real and temporary at the same time. Your body is fighting its way back toward balance.",
          },
          {
            headline:
              "The worst acute physical symptoms may ease, but the body can still feel depleted.",
            improving: [
              "Appetite, hydration, and muscle tension may become easier to manage.",
              "Short bursts of energy may appear more often.",
            ],
            stillPossible: [
              "Fatigue, poor sleep, restlessness, and flu-like heaviness can still linger.",
              "Your body may feel fragile or underpowered for a while.",
            ],
            expectations: [
              "This stage is often better than week 1 without feeling comfortable yet.",
              "Physical healing may require more patience than people expect.",
            ],
            encouragement:
              "Needing rest here is not weakness. It is part of how the body repairs after opioids.",
          },
          {
            headline:
              "Physical recovery often becomes more workable, even if energy still rebuilds slowly.",
            improving: [
              "Sleep, appetite, and baseline strength may trend upward week by week.",
              "The body may start responding better to exercise, sunlight, and routine.",
            ],
            stillPossible: [
              "Low stamina, aches, and stress sensitivity may still be stubborn.",
              "It can still feel like your body is slower than your motivation.",
            ],
            expectations: [
              "Weeks 5-8 often reward consistency more than intensity.",
              "Slow rebuilding is common and still meaningful.",
            ],
            encouragement:
              "You may feel far from normal and still be substantially improved from day 1.",
          },
          {
            headline:
              "The body often starts feeling more dependable again, even if not fully reset.",
            improving: [
              "Energy recovery may last longer through the day.",
              "Sleep and digestion may feel more predictable than earlier months.",
            ],
            stillPossible: [
              "Fatigue, aches, and sleep disruption can still flare during stress.",
              "The pace may feel frustratingly gradual compared with how hard you are working.",
            ],
            expectations: [
              "By this stage, progress is often quieter but more stable.",
              "Physical recovery can continue for months after the crisis feeling fades.",
            ],
            encouragement:
              "You are not waiting for healing to start. You are already in the middle of it.",
          },
          {
            headline:
              "Longer-term physical repair often looks like steadier endurance and better recovery from stress.",
            improving: [
              "Daily stamina and sleep recovery may keep sharpening.",
              "Exercise tolerance and general resilience often improve across these months.",
            ],
            stillPossible: [
              "Bad sleep or major stress can still light up older symptoms.",
              "Progress can feel slow because the body is now refining instead of rescuing.",
            ],
            expectations: [
              "This stage is often about restoring reliability, not chasing dramatic gains.",
              "The body may still be healing even when symptoms are less obvious.",
            ],
            encouragement:
              "A stronger baseline is usually built slowly. That slower pace still leads somewhere real.",
          },
          {
            headline:
              "Opioid-related physical recovery often continues through stable routines and maintenance.",
            improving: [
              "Resilience, physical trust, and recovery after hard days can continue improving.",
              "The body often becomes easier to care for once crisis-level symptoms fade.",
            ],
            stillPossible: [
              "Stress and sleep loss can still expose old weak points.",
              "You may occasionally forget how far the body has already come.",
            ],
            expectations: [
              "Long-term repair tends to reward consistency over intensity.",
              "Protection of your baseline becomes as important as rebuilding it.",
            ],
            encouragement:
              "Your body can keep healing in recovery, even after the loudest symptoms are gone.",
          },
        ],
      },
      MENTAL: {
        curve: [
          { day: 0, percent: 5 },
          { day: 7, percent: 12 },
          { day: 30, percent: 28 },
          { day: 90, percent: 54 },
          { day: 180, percent: 72 },
          { day: 365, percent: 88 },
        ],
        bands: [
          {
            headline:
              "The brain is just beginning to rebalance reward, stress, and motivation signals.",
            improving: [
              "Very small windows of clearer thinking may start appearing.",
              "The brain is beginning the slow work of restoring its own dopamine balance.",
            ],
            stillPossible: [
              "Cravings, low mood, restlessness, and emotional rawness can feel overpowering.",
              "Motivation may feel almost absent even when you want recovery.",
            ],
            expectations: [
              "Week 1 can feel mentally flat, anxious, or chaotic all at once.",
              "It is common for the brain to heal more slowly than your intentions.",
            ],
            encouragement:
              "Low motivation in early opioid recovery is common. It is not proof that you do not care.",
          },
          {
            headline:
              "Mental energy may still be low, but the fog usually becomes easier to notice and name.",
            improving: [
              "Attention and emotional control may return in brief, uneven stretches.",
              "You may find it easier to pause before acting on every urge.",
            ],
            stillPossible: [
              "Anhedonia, low motivation, depression, and irritability may still be heavy.",
              "It can feel discouraging when you are sober but not mentally lit up yet.",
            ],
            expectations: [
              "The brain often needs more time than the body to feel hopeful again.",
              "Structure can carry you through periods when motivation is unreliable.",
            ],
            encouragement:
              "Borrowing stability from routine is still real progress while your brain chemistry catches up.",
          },
          {
            headline:
              "Mental repair often becomes more visible as reward systems slowly wake back up.",
            improving: [
              "Focus, planning, and emotional range may widen week by week.",
              "Pleasure from ordinary things may begin returning in small but real ways.",
            ],
            stillPossible: [
              "Flat mood, impatience, or strong craving spikes can still happen.",
              "Some days may feel mentally brighter while others feel almost unchanged.",
            ],
            expectations: [
              "Recovery often feels mentally inconsistent here, not absent.",
              "It is normal to want progress to feel faster than it does.",
            ],
            encouragement:
              "The return of interest and motivation usually comes back in layers. Even small layers matter.",
          },
          {
            headline: "Mental recovery can start feeling more believable, not just possible.",
            improving: [
              "Planning, follow-through, and emotional steadiness often get more reliable.",
              "You may feel less trapped inside cravings or mental noise.",
            ],
            stillPossible: [
              "Stress can still flatten motivation or magnify old thinking patterns.",
              "You may still feel tender around shame, boredom, or loneliness.",
            ],
            expectations: [
              "This stage often rewards honest structure, community, and simple repetition.",
              "The gains may be steadier than dramatic, which is usually a good sign.",
            ],
            encouragement:
              "You do not need to feel perfect to be healing. More steady is already a big shift.",
          },
          {
            headline: "The brain often begins tolerating normal life with less internal friction.",
            improving: [
              "Motivation, memory, and resilience under stress may keep strengthening.",
              "Pleasure and meaning can feel less distant than they did early on.",
            ],
            stillPossible: [
              "High stress or isolation can still wake up low mood or craving loops.",
              "Mentally flat weeks can still happen and usually pass.",
            ],
            expectations: [
              "Longer-term recovery often feels more about stability than intensity.",
              "You may notice better recovery from setbacks, not just fewer setbacks.",
            ],
            encouragement:
              "A steadier brain is often built by staying close to the basics long after the emergency feeling fades.",
          },
          {
            headline:
              "Long-term opioid recovery often supports deeper trust, steadier mood, and better self-direction.",
            improving: [
              "Emotional regulation and follow-through may feel more natural than forced.",
              "The brain often gets better at returning to center after stress.",
            ],
            stillPossible: [
              "Major stress can still light up old reward-seeking patterns.",
              "You may still need support even while doing much better overall.",
            ],
            expectations: [
              "Maintenance matters because healing stays active over time.",
              "Long-term growth often shows up as faster recovery after disruption.",
            ],
            encouragement:
              "What once felt impossible can eventually feel practiced. That is a real form of healing.",
          },
        ],
      },
    },
  },
  METH_STIMULANTS: {
    label: "Meth / stimulants",
    shortLabel: "Stimulants",
    tracks: {
      PHYSICAL: {
        curve: [
          { day: 0, percent: 10 },
          { day: 7, percent: 24 },
          { day: 30, percent: 48 },
          { day: 90, percent: 70 },
          { day: 180, percent: 84 },
          { day: 365, percent: 93 },
        ],
        bands: [
          {
            headline:
              "Your body is coming down from heavy overstimulation and trying to reset its base rhythm.",
            improving: [
              "Hydration, appetite, and rest pressure may start rebuilding.",
              "The body may begin asking clearly for sleep and food again.",
            ],
            stillPossible: [
              "Crash-level fatigue, body heaviness, deep sleep, or very poor sleep can all show up.",
              "Your body may feel depleted, wired, or both.",
            ],
            expectations: [
              "The first week is often more about collapse and repair than performance.",
              "Oversleeping or feeling physically flattened can be part of the reset.",
            ],
            encouragement:
              "Extreme fatigue can be part of recovery, not proof that something is wrong with your effort.",
          },
          {
            headline:
              "Basic physical rhythm often becomes more predictable, even if energy still feels fragile.",
            improving: [
              "Appetite and hydration can feel easier to manage.",
              "The body may start responding better to short walks, sunlight, and sleep routine.",
            ],
            stillPossible: [
              "Fatigue, headaches, body aches, and low stamina may still hang around.",
              "You may still feel physically slow compared with where you want to be.",
            ],
            expectations: [
              "It can take a while for physical energy to feel trustworthy again.",
              "Small, repeatable routines usually help more than pushing too hard too early.",
            ],
            encouragement:
              "A slower body is often a healing body after stimulant use. Let the reset do its work.",
          },
          {
            headline:
              "Energy and sleep often start feeling more usable, even if they are not fully smooth yet.",
            improving: [
              "Daily stamina may last longer and recover faster.",
              "Sleep pressure and hunger cues can feel more normal than earlier weeks.",
            ],
            stillPossible: [
              "Restlessness, sleep reversals, or sudden fatigue can still pop up.",
              "Stress can still expose how much healing the body is doing under the surface.",
            ],
            expectations: [
              "Weeks 5-8 often reward patient consistency more than intensity.",
              "The body may be less dramatic now while still making meaningful gains.",
            ],
            encouragement:
              "This is often the stage where the body begins to feel more trustworthy again, even if not effortless.",
          },
          {
            headline: "Physical resilience often becomes more stable and easier to protect.",
            improving: [
              "Recovery after busy days may feel smoother.",
              "Sleep, strength, and appetite can continue settling into a healthier pattern.",
            ],
            stillPossible: [
              "Overdoing caffeine, stress, or poor sleep can still hit harder than expected.",
              "Progress may feel subtle because the biggest crashes are less frequent.",
            ],
            expectations: [
              "This phase often feels less dramatic and more sustainable.",
              "Protecting routine matters as much as building routine here.",
            ],
            encouragement:
              "The body often keeps rewarding gentler consistency long after the first crash is over.",
          },
          {
            headline:
              "Longer-term stimulant recovery often looks like steadier energy and more reliable recovery from stress.",
            improving: [
              "Sleep recovery and all-day endurance may keep strengthening.",
              "The body can begin tolerating a fuller life without the same rebound cost.",
            ],
            stillPossible: [
              "Stress or sleep debt can still wake up old exhaustion quickly.",
              "You may still notice a gap between good days and great days.",
            ],
            expectations: [
              "The middle months are often about durability more than speed.",
              "A slower, steadier baseline is usually a strong sign.",
            ],
            encouragement:
              "You are not trying to become superhuman. You are rebuilding a body that can stay steady.",
          },
          {
            headline:
              "Stimulant-related physical recovery often keeps deepening through maintenance and rhythm.",
            improving: [
              "Stable sleep, nutrition, and movement can keep compounding benefits.",
              "Your body may recover more cleanly after hard days than it once did.",
            ],
            stillPossible: [
              "Major stress can still temporarily shrink your physical margin.",
              "You may still need more structure than you expected.",
            ],
            expectations: [
              "Long-term healing is usually about preserving regulation, not chasing intensity.",
              "Your best progress often looks ordinary and repeatable.",
            ],
            encouragement:
              "A sustainable body is often built in calm, consistent days. That is real progress.",
          },
        ],
      },
      MENTAL: {
        curve: [
          { day: 0, percent: 4 },
          { day: 7, percent: 10 },
          { day: 30, percent: 24 },
          { day: 90, percent: 50 },
          { day: 180, percent: 70 },
          { day: 365, percent: 86 },
        ],
        bands: [
          {
            headline: "Your brain is starting a deep reset after prolonged overstimulation.",
            improving: [
              "The nervous system may begin leaving survival mode in very small steps.",
              "Moments of quiet or clearer thinking may start appearing unexpectedly.",
            ],
            stillPossible: [
              "Depression, paranoia, anxiety, sleep disruption, and flat motivation can still feel intense.",
              "Concentration may feel almost unavailable at times.",
            ],
            expectations: [
              "Mental recovery after stimulants often feels slower than people hope.",
              "The first week can be more about crash, sleep, and safety than motivation.",
            ],
            encouragement:
              "A blank or low-feeling mind can still be healing. Early quiet is not failure.",
          },
          {
            headline:
              "Mental clarity may return in flashes while motivation still feels underpowered.",
            improving: [
              "Attention and emotional control may be available for longer stretches.",
              "Sleep can support clearer mornings, even if afternoons still dip hard.",
            ],
            stillPossible: [
              "Low mood, anhedonia, irritability, or suspicion may still surface.",
              "Motivation can be unreliable even when you care deeply about recovery.",
            ],
            expectations: [
              "The brain often needs repetitive calm before it trusts normal life again.",
              "Hope may return before enjoyment does, or vice versa.",
            ],
            encouragement:
              "You do not need to force inspiration right now. Stability is already meaningful progress.",
          },
          {
            headline:
              "Mental repair often becomes easier to feel as reward circuits begin waking back up.",
            improving: [
              "Focus, planning, and emotional range may become more available.",
              "Ordinary wins may start feeling slightly rewarding again.",
            ],
            stillPossible: [
              "Flat mood, boredom, or sharp craving loops can still interrupt progress.",
              "Stress may still make your thinking feel more fragile than it is.",
            ],
            expectations: [
              "Weeks 5-8 are often about rebuilding trust in normal daily life.",
              "Gains can feel small from the inside while still being real from the outside.",
            ],
            encouragement:
              "The return of interest and focus is often gradual. Gradual does not mean weak.",
          },
          {
            headline:
              "Mental recovery can begin feeling more stable and less dependent on pure effort.",
            improving: [
              "Planning, memory, and emotional regulation often get easier to hold onto.",
              "You may rebound faster after stressful or triggering moments.",
            ],
            stillPossible: [
              "Some empty-feeling days can still happen.",
              "Stress, lack of sleep, or isolation can still magnify old patterns.",
            ],
            expectations: [
              "This phase often feels steadier rather than exciting, which is usually a good sign.",
              "The nervous system may still be healing even when life looks more normal.",
            ],
            encouragement:
              "A mind that is calmer and more usable is a big form of progress, even if it feels ordinary.",
          },
          {
            headline:
              "Longer-term stimulant recovery often supports better focus, patience, and emotional durability.",
            improving: [
              "Concentration and follow-through may keep strengthening.",
              "You may trust your recovery habits more because they work under normal stress.",
            ],
            stillPossible: [
              "Intense stress or poor sleep can still bring back mental fog or strong urges.",
              "You may still have tender spots around boredom or overstimulation.",
            ],
            expectations: [
              "The middle months often deepen recovery more than they advertise it.",
              "Progress may show up as faster resets, not just fewer symptoms.",
            ],
            encouragement:
              "A regulated brain is often built through repetition, not rush. You are allowed to heal at that speed.",
          },
          {
            headline:
              "Long-term mental recovery often feels like stronger self-direction and steadier emotional range.",
            improving: [
              "Attention, patience, and resilience can continue maturing over time.",
              "You may notice more space between an impulse and your response to it.",
            ],
            stillPossible: [
              "Major life stress can still wake up old stimulant thinking.",
              "You may still need structure even when doing well overall.",
            ],
            expectations: [
              "Maintenance remains part of the work because healing stays active.",
              "Long-term gains often look like faster returns to baseline after disruption.",
            ],
            encouragement:
              "The mind you are rebuilding can become more dependable than the one stimulant use trained you to expect.",
          },
        ],
      },
    },
  },
  MARIJUANA: {
    label: "Marijuana",
    shortLabel: "Marijuana",
    tracks: {
      PHYSICAL: {
        curve: [
          { day: 0, percent: 20 },
          { day: 7, percent: 35 },
          { day: 30, percent: 60 },
          { day: 90, percent: 82 },
          { day: 180, percent: 92 },
          { day: 365, percent: 97 },
        ],
        bands: [
          {
            headline:
              "Your body is adjusting to sleep, appetite, and stress without marijuana on board.",
            improving: [
              "The body may begin reclaiming its own sleep pressure and hunger rhythm.",
              "Breathing, movement, and energy can start feeling clearer in short windows.",
            ],
            stillPossible: [
              "Sleep disruption, appetite swings, headaches, sweating, or restlessness can still happen.",
              "You may feel oddly wired at night and tired during the day.",
            ],
            expectations: [
              "Week 1 can feel more physically noticeable than many people expect.",
              "The body usually recalibrates faster than the mind, but not always comfortably.",
            ],
            encouragement:
              "A rough adjustment does not mean your body needs marijuana to function. It often means it is learning to self-regulate again.",
          },
          {
            headline: "Physical rhythm often gets noticeably steadier through the first month.",
            improving: [
              "Sleep, appetite, and baseline energy may start syncing back up.",
              "Lung comfort and exercise tolerance may feel a little cleaner if smoking was involved.",
            ],
            stillPossible: [
              "Dream intensity, irritability, and light sleep can still visit.",
              "The body may still be sensitive to caffeine, stress, or late nights.",
            ],
            expectations: [
              "Many people start feeling physically lighter here, even if mentally restless.",
              "The gains can be real before they feel dramatic.",
            ],
            encouragement:
              "This stage often brings the first real glimpse that your body can regulate itself again.",
          },
          {
            headline: "Physical repair often feels more settled and easier to maintain.",
            improving: [
              "Sleep pressure, appetite, and everyday energy may be more dependable.",
              "Morning grogginess and low-level sluggishness may continue lifting.",
            ],
            stillPossible: [
              "Stress or poor sleep can still make the body feel temporarily off.",
              "You may still have occasional nights where sleep feels unusually light.",
            ],
            expectations: [
              "Weeks 5-8 are often about reinforcing healthy rhythm rather than chasing rapid change.",
              "The body may now respond well to routine meals, movement, and light exposure.",
            ],
            encouragement:
              "Your body is often more repaired than it feels on the hardest day of the week.",
          },
          {
            headline:
              "Physical recovery usually feels less fragile and more like a stable baseline.",
            improving: [
              "Energy and sleep recovery may hold up better under normal stress.",
              "Daily movement, appetite, and rest can feel more naturally timed.",
            ],
            stillPossible: [
              "Late nights, stress, or emotional spikes can still disturb your rhythm.",
              "You may still notice how quickly recovery benefits shrink when routine slips.",
            ],
            expectations: [
              "The pace usually slows here because the body is refining, not rescuing.",
              "Protecting your baseline becomes the main task.",
            ],
            encouragement:
              "A calmer baseline is easy to underrate because it feels normal. Normal can be a huge recovery win.",
          },
          {
            headline:
              "Longer-term physical recovery often looks like better rhythm, stamina, and follow-through.",
            improving: [
              "Sleep, appetite, and energy may keep responding well to consistent routine.",
              "You may recover faster from hard days than you did early on.",
            ],
            stillPossible: [
              "High stress can still tug on old comfort-seeking habits.",
              "A temporary rough patch does not mean you have lost your progress.",
            ],
            expectations: [
              "Most gains now are subtle, steady, and easier to preserve.",
              "Physical healing often becomes more about maintenance than repair.",
            ],
            encouragement:
              "The more ordinary your physical recovery feels, the more likely it is becoming durable.",
          },
          {
            headline:
              "Long-term marijuana recovery often supports a cleaner daily rhythm and steadier energy.",
            improving: [
              "Your body may keep benefiting from predictable sleep, food, and movement.",
              "Stress recovery can feel smoother than it did during active use.",
            ],
            stillPossible: [
              "Stress or boredom can still tempt older coping patterns.",
              "You may still need structure even when the body feels mostly repaired.",
            ],
            expectations: [
              "Maintenance keeps the gains real.",
              "Long-term stability usually grows from protecting the simple routines that work.",
            ],
            encouragement:
              "The body often keeps rewarding sober structure long after the obvious symptoms fade.",
          },
        ],
      },
      MENTAL: {
        curve: [
          { day: 0, percent: 10 },
          { day: 7, percent: 20 },
          { day: 30, percent: 43 },
          { day: 90, percent: 72 },
          { day: 180, percent: 86 },
          { day: 365, percent: 95 },
        ],
        bands: [
          {
            headline:
              "Your mind is adjusting to being fully awake and fully present without marijuana.",
            improving: [
              "Attention and reaction time may start clearing in brief windows.",
              "You may begin noticing emotions more directly instead of softened through use.",
            ],
            stillPossible: [
              "Irritability, anxiety, restlessness, and strong dream rebound can still be active.",
              "It may feel like your mind is louder than you expected.",
            ],
            expectations: [
              "Week 1 often feels mentally sharper and more emotionally raw at the same time.",
              "The return of clarity can be uncomfortable before it feels empowering.",
            ],
            encouragement:
              "Feeling more does not mean you are getting worse. It often means you are no longer numbing the signal.",
          },
          {
            headline:
              "Mental clarity often builds through the first month, even if mood still feels jumpy.",
            improving: [
              "Short-term memory and focus may begin feeling more reliable.",
              "You may start responding faster and thinking more cleanly in conversation.",
            ],
            stillPossible: [
              "Low patience, cravings, vivid dreams, and anxiety can still show up.",
              "You may miss the old off-switch even while thinking more clearly.",
            ],
            expectations: [
              "The first month often improves attention faster than emotional comfort.",
              "Many people notice better clarity before they notice peace.",
            ],
            encouragement:
              "A sharper mind can feel intense before it feels freeing. That transition is common.",
          },
          {
            headline:
              "Mental recovery often becomes more obvious as concentration and motivation keep rising.",
            improving: [
              "Focus, follow-through, and interest in ordinary tasks may continue improving.",
              "You may feel less mentally foggy and less passively checked out.",
            ],
            stillPossible: [
              "Stress, boredom, or loneliness can still spark urges to shut down mentally.",
              "Mood swings may still show up during poor sleep or conflict.",
            ],
            expectations: [
              "Weeks 5-8 often reward active structure and honest stimulation.",
              "Your mind may now feel clearer enough to notice where you still need support.",
            ],
            encouragement:
              "Clarity is a real gain, even when it exposes work you still need to do.",
          },
          {
            headline: "Mental steadiness often feels more durable and less dependent on mood.",
            improving: [
              "Memory, attention span, and emotional presence may keep strengthening.",
              "You may feel more able to stay with discomfort without escaping it.",
            ],
            stillPossible: [
              "Stress or sleep loss can still exaggerate old cravings or irritability.",
              "Some days may still feel flat or overamped.",
            ],
            expectations: [
              "This phase usually feels more dependable than exciting.",
              "The goal here is not perfection. It is a clearer, steadier baseline.",
            ],
            encouragement:
              "Staying mentally present is a meaningful recovery skill, even when it feels ordinary.",
          },
          {
            headline:
              "Longer-term mental recovery often supports better motivation, memory, and emotional honesty.",
            improving: [
              "You may trust your concentration and decision-making more.",
              "The brain often gets better at regulating without needing to disengage from life.",
            ],
            stillPossible: [
              "Stress, boredom, or social triggers can still make old habits feel tempting.",
              "You may still need intentional structure to protect your gains.",
            ],
            expectations: [
              "The middle months often deepen stability more than they advertise it.",
              "You may notice quicker resets after rough days.",
            ],
            encouragement:
              "A clearer, more awake mind can feel vulnerable at first. Over time it usually becomes one of recovery's strongest gifts.",
          },
          {
            headline:
              "Long-term marijuana recovery often feels like clearer thinking, better follow-through, and more honest emotional presence.",
            improving: [
              "Self-awareness, memory, and emotional range may keep maturing.",
              "Your mind may return to center more quickly when stress rises.",
            ],
            stillPossible: [
              "Old escape patterns can still surface under pressure.",
              "You may still need rituals that support rest and emotional regulation.",
            ],
            expectations: [
              "Maintenance matters because clarity is easier to protect than rebuild.",
              "Long-term gains often show up as cleaner decisions in ordinary moments.",
            ],
            encouragement:
              "You are not only removing a habit. You are rebuilding a mind that stays present more naturally.",
          },
        ],
      },
    },
  },
  KRATOM: {
    label: "Kratom",
    shortLabel: "Kratom",
    tracks: {
      PHYSICAL: {
        curve: [
          { day: 0, percent: 8 },
          { day: 7, percent: 22 },
          { day: 30, percent: 45 },
          { day: 90, percent: 69 },
          { day: 180, percent: 83 },
          { day: 365, percent: 91 },
        ],
        bands: [
          {
            headline:
              "Your body is resetting after a substance that can affect both opioid-like and stimulant-like systems.",
            improving: [
              "The body may begin re-establishing its own sleep, appetite, and energy rhythm.",
              "Acute withdrawal intensity can start easing even when comfort is still low.",
            ],
            stillPossible: [
              "Restlessness, chills, body aches, gut issues, and poor sleep may still be active.",
              "Energy may swing between drained and edgy.",
            ],
            expectations: [
              "The first week can feel physically confusing because symptoms do not always move in one clean direction.",
              "Relief often comes in uneven waves.",
            ],
            encouragement:
              "A mixed symptom picture is common with kratom recovery. Uneven does not mean you are off track.",
          },
          {
            headline:
              "Physical rhythm may begin stabilizing, though fatigue and sleep issues can still linger.",
            improving: [
              "Appetite, hydration, and baseline comfort may become easier to manage.",
              "Short stretches of more normal energy may start appearing.",
            ],
            stillPossible: [
              "Body aches, poor sleep, temperature swings, and restlessness can still hang around.",
              "You may feel physically better than week 1 without feeling fully strong yet.",
            ],
            expectations: [
              "Weeks 2-4 are often more manageable than the first days but still not effortless.",
              "Consistency usually helps more than intensity during this stage.",
            ],
            encouragement:
              "You may still feel fragile and still be healing well. Both can be true at once.",
          },
          {
            headline:
              "Physical recovery often becomes more stable and easier to read from week to week.",
            improving: [
              "Sleep, digestion, and energy may become more predictable.",
              "The body can begin tolerating movement and routine with less rebound cost.",
            ],
            stillPossible: [
              "Stress, caffeine, or sleep loss can still trigger restless or achy days.",
              "The pace may feel slower than you want even when the trend is upward.",
            ],
            expectations: [
              "Weeks 5-8 are often about rebuilding trust in your baseline.",
              "The gains may be steady even when they stop feeling dramatic.",
            ],
            encouragement:
              "A less chaotic body is usually a sign of real healing, even when you still notice symptoms.",
          },
          {
            headline: "Physical recovery can begin feeling less brittle and more sustainable.",
            improving: [
              "Daily stamina and stress recovery often get more reliable.",
              "Sleep and appetite may feel easier to protect with routine.",
            ],
            stillPossible: [
              "Off days can still happen, especially during stress or poor rest.",
              "You may still feel sensitive to routine disruption.",
            ],
            expectations: [
              "This stage usually looks steadier rather than spectacular.",
              "Protecting the routines that work becomes more important than chasing faster gains.",
            ],
            encouragement:
              "A body that is less reactive is often a body that is quietly recovering well.",
          },
          {
            headline:
              "Longer-term kratom recovery often brings steadier energy and cleaner physical regulation.",
            improving: [
              "Stress recovery, sleep consistency, and stamina may continue improving.",
              "You may notice fewer rebounds after hard days.",
            ],
            stillPossible: [
              "High stress can still wake up old vulnerability patterns.",
              "You may still need structure to keep the baseline protected.",
            ],
            expectations: [
              "The middle months are often about durability, not drama.",
              "Physical healing may keep moving even when you stop paying as much attention to it.",
            ],
            encouragement:
              "Your body often keeps benefiting from sober consistency long after the obvious discomfort drops.",
          },
          {
            headline:
              "Long-term physical recovery from kratom often feels calmer, steadier, and easier to maintain.",
            improving: [
              "Sleep, appetite, and day-to-day energy may keep responding well to routine.",
              "The body may recover faster from stress than it did earlier in sobriety.",
            ],
            stillPossible: [
              "Old weak spots can still show up during intense stress or sleep loss.",
              "Needing maintenance does not mean healing has failed.",
            ],
            expectations: [
              "Long-term gains are usually preserved through ordinary habits.",
              "The work now is less about repair and more about protection.",
            ],
            encouragement:
              "Keeping your baseline matters. That is not boring recovery, it is durable recovery.",
          },
        ],
      },
      MENTAL: {
        curve: [
          { day: 0, percent: 7 },
          { day: 7, percent: 15 },
          { day: 30, percent: 32 },
          { day: 90, percent: 58 },
          { day: 180, percent: 74 },
          { day: 365, percent: 89 },
        ],
        bands: [
          {
            headline:
              "Your brain is beginning to rebalance mood, stress, and reward signals after kratom.",
            improving: [
              "Brief windows of clearer thinking may start showing up.",
              "The brain is beginning to relearn how to regulate without kratom's support.",
            ],
            stillPossible: [
              "Anxiety, irritability, low motivation, and emotional rawness can still feel intense.",
              "Concentration may still be thin and unreliable.",
            ],
            expectations: [
              "Week 1 often feels mentally noisy, flat, or both.",
              "The brain can need more time than the body to feel normal again.",
            ],
            encouragement:
              "Feeling mentally off early on is common. It does not mean your progress is fake.",
          },
          {
            headline: "Mental clarity may return in pieces while mood still feels tender.",
            improving: [
              "Attention, memory, and patience may improve in short stretches.",
              "You may find it easier to notice a craving without immediately following it.",
            ],
            stillPossible: [
              "Anhedonia, anxious energy, irritability, or flatness can still come and go.",
              "Motivation may lag behind your commitment.",
            ],
            expectations: [
              "The brain often heals unevenly during this stage.",
              "A more structured life can carry you through the days your mood does not cooperate.",
            ],
            encouragement:
              "Borrowing momentum from routine is still progress while your mind catches up.",
          },
          {
            headline:
              "Mental repair often becomes easier to feel as attention and emotional range expand.",
            improving: [
              "Planning, focus, and emotional flexibility may feel stronger than earlier weeks.",
              "Ordinary tasks may start feeling more manageable and less draining.",
            ],
            stillPossible: [
              "Stress or boredom can still wake up craving loops or low mood.",
              "Some days may still feel mentally flat without warning.",
            ],
            expectations: [
              "Weeks 5-8 are often about building confidence in your new baseline.",
              "Progress may feel gradual while still being meaningful.",
            ],
            encouragement:
              "More stable thinking often arrives before more confident thinking. Both are part of healing.",
          },
          {
            headline: "Mental recovery can begin feeling steadier and less reactive.",
            improving: [
              "Mood regulation and follow-through often get more dependable.",
              "You may recover faster from triggers than you did early on.",
            ],
            stillPossible: [
              "Stress can still flatten motivation or sharpen old thoughts.",
              "You may still feel tender around exhaustion or loneliness.",
            ],
            expectations: [
              "This phase usually rewards low drama, strong routine, and honest support.",
              "The gains may be steadier than they are flashy.",
            ],
            encouragement:
              "A calmer, more usable mind is a major recovery milestone even if it does not feel dramatic.",
          },
          {
            headline:
              "Longer-term mental recovery often looks like better resilience and cleaner self-direction.",
            improving: [
              "Focus, patience, and emotional range may keep strengthening.",
              "Your mind may find its way back to center more quickly after stress.",
            ],
            stillPossible: [
              "Major stress can still wake up old coping fantasies.",
              "A hard week can still feel discouraging even when your trend is strong.",
            ],
            expectations: [
              "The middle months often deepen stability more than they advertise it.",
              "You may notice more recovery after disruption, not just fewer symptoms overall.",
            ],
            encouragement:
              "Steadier thinking is often built in ordinary days. Those ordinary days matter.",
          },
          {
            headline:
              "Long-term kratom recovery often supports more grounded mood, clearer thinking, and better self-trust.",
            improving: [
              "Emotional regulation and follow-through may feel more natural.",
              "You may notice more space between stress and impulsive response.",
            ],
            stillPossible: [
              "Old habits can still surface during major pressure or isolation.",
              "You may still need support to protect the gains you have built.",
            ],
            expectations: [
              "Maintenance keeps recovery durable.",
              "Long-term healing often shows up as faster resets and cleaner decisions.",
            ],
            encouragement:
              "The mind you are building now can become steadier than the one kratom trained you to expect.",
          },
        ],
      },
    },
  },
};

function uniqueValues<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function labelForSubstance(value: RecoverySubstanceCategory): string {
  return RECOVERY_LIBRARY[value].label;
}

function labelForKind(kind: RecoveryInsightKind): string {
  return kind === "MENTAL" ? "Mental Recovery" : "Physical Recovery";
}

function resolveWeekNumber(daysSober: number, hasDate: boolean): number {
  if (!hasDate) {
    return 0;
  }
  return Math.max(1, Math.floor(daysSober / 7) + 1);
}

function interpolatePercent(curve: RecoveryCurvePoint[], day: number): number {
  if (curve.length === 0) {
    return 0;
  }
  if (day <= curve[0].day) {
    return clampPercent(curve[0].percent);
  }

  for (let index = 0; index < curve.length - 1; index += 1) {
    const current = curve[index];
    const next = curve[index + 1];
    if (day <= next.day) {
      const span = next.day - current.day;
      const progress = span <= 0 ? 0 : (day - current.day) / span;
      return clampPercent(current.percent + (next.percent - current.percent) * progress);
    }
  }

  return clampPercent(curve[curve.length - 1].percent);
}

function resolveBandMeta(weekNumber: number): RecoveryBandMeta {
  return (
    RECOVERY_BANDS.find(
      (band) =>
        weekNumber >= band.weekStart && (band.weekEnd === null || weekNumber <= band.weekEnd),
    ) ?? RECOVERY_BANDS[RECOVERY_BANDS.length - 1]
  );
}

function resolveTrackProgress(input: {
  substance: RecoverySubstanceCategory;
  kind: RecoveryInsightKind;
  daysSober: number;
  weekNumber: number;
}): SubstanceTrackProgress {
  const definition = RECOVERY_LIBRARY[input.substance];
  const track = definition.tracks[input.kind];
  const bandMeta = resolveBandMeta(input.weekNumber);
  const bandIndex = RECOVERY_BANDS.findIndex((band) => band.id === bandMeta.id);
  const bandContent = track.bands[bandIndex];

  return {
    substance: input.substance,
    substanceLabel: definition.label,
    percent: interpolatePercent(track.curve, input.daysSober),
    weekNumber: input.weekNumber,
    bandMeta,
    bandContent,
  };
}

function formatTrendLine(input: {
  kind: RecoveryInsightKind;
  track: RecoveryTrackDefinition;
  daysSober: number;
  weekNumber: number;
  percent: number;
}): string {
  const nextWeekPercent = interpolatePercent(input.track.curve, input.daysSober + 7);
  const delta = Math.max(0, nextWeekPercent - input.percent);
  if (delta < 1) {
    return `Trend: week ${input.weekNumber} may feel steadier than faster. Even smaller gains can still reinforce ${input.kind === "MENTAL" ? "clarity and emotional balance" : "sleep, energy, and physical resilience"}.`;
  }
  const perDay = delta / 7;
  return `Trend: you may continue seeing roughly ${perDay.toFixed(1)}% improvement per day this week if your recovery routine stays supported.`;
}

function sortTracksByPercentAscending(tracks: SubstanceTrackProgress[]): SubstanceTrackProgress[] {
  return [...tracks].sort((left, right) => left.percent - right.percent);
}

export function normalizeRecoverySubstances(
  values: RecoverySubstanceCategory[],
): RecoverySubstanceCategory[] {
  const allowed = new Set(RECOVERY_SUBSTANCE_OPTIONS.map((option) => option.value));
  return uniqueValues(
    values.filter((value): value is RecoverySubstanceCategory => allowed.has(value)),
  );
}

function buildEmptyGauge(
  kind: RecoveryInsightKind,
  hasSobrietyDate: boolean,
): RecoveryGaugeTileSummary {
  return {
    kind,
    label: labelForKind(kind),
    hasProfile: false,
    percent: null,
    weekNumber: 0,
    selectedSubstance: null,
    selectedSubstanceLabel: null,
    summaryLine: hasSobrietyDate
      ? "Select at least one recovery substance to personalize this gauge."
      : "Add your sobriety date to unlock this educational recovery gauge.",
    supportiveLine: "These percentages are supportive trend guidance, not clinical measurements.",
    educationalNote: EDUCATIONAL_NOTE,
  };
}

function buildGaugeSummary(input: {
  kind: RecoveryInsightKind;
  sobrietyDateIso: string | null;
  nowMs: number;
  substances: RecoverySubstanceCategory[];
}): RecoveryGaugeTileSummary {
  const selectedSubstances = normalizeRecoverySubstances(input.substances);
  const hasSobrietyDate = Boolean(input.sobrietyDateIso);
  if (!hasSobrietyDate || selectedSubstances.length === 0) {
    return buildEmptyGauge(input.kind, hasSobrietyDate);
  }

  const daysSober = getDaysSober(input.sobrietyDateIso, input.nowMs);
  const weekNumber = resolveWeekNumber(daysSober, true);
  const tracks = sortTracksByPercentAscending(
    selectedSubstances.map((substance) =>
      resolveTrackProgress({
        substance,
        kind: input.kind,
        daysSober,
        weekNumber,
      }),
    ),
  );
  const primaryTrack = tracks[0];
  const multiSubstance = tracks.length > 1;

  return {
    kind: input.kind,
    label: labelForKind(input.kind),
    hasProfile: true,
    percent: primaryTrack.percent,
    weekNumber,
    selectedSubstance: primaryTrack.substance,
    selectedSubstanceLabel: primaryTrack.substanceLabel,
    summaryLine: multiSubstance
      ? `${primaryTrack.substanceLabel} is setting the pace right now. The other selected timelines can keep improving alongside it.`
      : primaryTrack.bandContent.encouragement,
    supportiveLine: `${primaryTrack.bandMeta.label} • ${primaryTrack.bandContent.headline}`,
    educationalNote: EDUCATIONAL_NOTE,
  };
}

export function buildRecoveryDashboardViewModel(input: {
  sobrietyDateIso: string | null;
  nowMs: number;
  substances: RecoverySubstanceCategory[];
}): RecoveryDashboardViewModel {
  const selectedSubstances = normalizeRecoverySubstances(input.substances);
  const hasProfile = Boolean(input.sobrietyDateIso) && selectedSubstances.length > 0;
  const daysSober = getDaysSober(input.sobrietyDateIso, input.nowMs);
  const weekNumber = resolveWeekNumber(daysSober, Boolean(input.sobrietyDateIso));

  return {
    hasProfile,
    daysSober,
    weekNumber,
    selectedSubstances,
    gauges: {
      MENTAL: buildGaugeSummary({ ...input, kind: "MENTAL" }),
      PHYSICAL: buildGaugeSummary({ ...input, kind: "PHYSICAL" }),
    },
  };
}

export function buildRecoveryInsightDetailViewModel(input: {
  kind: RecoveryInsightKind;
  sobrietyDateIso: string | null;
  nowMs: number;
  substances: RecoverySubstanceCategory[];
  selectedSubstance: RecoverySubstanceCategory | null;
}): RecoveryInsightDetailViewModel {
  const selectedSubstances = normalizeRecoverySubstances(input.substances);
  const hasSobrietyDate = Boolean(input.sobrietyDateIso);
  const hasProfile = hasSobrietyDate && selectedSubstances.length > 0;
  const daysSober = getDaysSober(input.sobrietyDateIso, input.nowMs);
  const weekNumber = resolveWeekNumber(daysSober, hasSobrietyDate);
  const defaultSubstance = selectedSubstances[0] ?? RECOVERY_SUBSTANCE_OPTIONS[0].value;
  const resolvedSubstance =
    input.selectedSubstance && RECOVERY_LIBRARY[input.selectedSubstance]
      ? input.selectedSubstance
      : defaultSubstance;
  const substanceOptions =
    selectedSubstances.length > 0
      ? selectedSubstances.map((value) => ({ value, label: labelForSubstance(value) }))
      : RECOVERY_SUBSTANCE_OPTIONS;

  if (!hasProfile) {
    return {
      kind: input.kind,
      label: labelForKind(input.kind),
      hasProfile: false,
      daysSober,
      weekNumber,
      percent: null,
      percentLabel: `Estimated ${input.kind === "MENTAL" ? "mental" : "physical"} repair`,
      selectedSubstance: null,
      selectedSubstanceLabel: null,
      substanceOptions,
      snapshot: hasSobrietyDate
        ? "Choose at least one recovery substance to personalize this educational guide."
        : "Save your sobriety date to unlock week-based recovery guidance.",
      trendLine: "Trend guidance appears once your recovery profile is complete.",
      whatMayBeImproving: [],
      whatMayStillOccur: [],
      whatToExpect: [],
      encouragement:
        "This guide is meant to support reflection, not to replace medical or therapeutic care.",
      educationalNote: EDUCATIONAL_NOTE,
      emptyStateTitle: hasSobrietyDate ? "Add a recovery profile" : "Add your sobriety date",
      emptyStateBody: hasSobrietyDate
        ? "Select Alcohol, Opioids, Meth / stimulants, Marijuana, or Kratom in Recovery Settings or the setup wizard to unlock substance-specific guidance."
        : "Once your sobriety date is saved, this guide will calculate your current week number and estimate your mental and physical repair trends.",
    };
  }

  const definition = RECOVERY_LIBRARY[resolvedSubstance];
  const track = definition.tracks[input.kind];
  const progress = resolveTrackProgress({
    substance: resolvedSubstance,
    kind: input.kind,
    daysSober,
    weekNumber,
  });

  return {
    kind: input.kind,
    label: labelForKind(input.kind),
    hasProfile: true,
    daysSober,
    weekNumber,
    percent: progress.percent,
    percentLabel: `Estimated ${input.kind === "MENTAL" ? "mental" : "physical"} recovery`,
    selectedSubstance: resolvedSubstance,
    selectedSubstanceLabel: definition.label,
    substanceOptions,
    snapshot: `Week ${weekNumber}: ${progress.bandContent.headline}`,
    trendLine: formatTrendLine({
      kind: input.kind,
      track,
      daysSober,
      weekNumber,
      percent: progress.percent,
    }),
    whatMayBeImproving: progress.bandContent.improving,
    whatMayStillOccur: progress.bandContent.stillPossible,
    whatToExpect: progress.bandContent.expectations,
    encouragement: progress.bandContent.encouragement,
    educationalNote: EDUCATIONAL_NOTE,
    emptyStateTitle: "",
    emptyStateBody: "",
  };
}
