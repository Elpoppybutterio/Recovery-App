export type RecoverySubstanceCategory =
  | "ALCOHOL"
  | "OPIOIDS"
  | "METH_STIMULANTS"
  | "MARIJUANA"
  | "KRATOM";

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type StageOffset =
  | {
      unit: "days";
      value: number;
    }
  | {
      unit: "months" | "years";
      value: number;
    };

type PhysicalRecoveryStageDefinition = {
  id: string;
  label: string;
  windowLabel: string;
  startsAfter: StageOffset;
  summary: string;
  whatMayBeHappening: string[];
  whatMayFeelNormal: string[];
  whatOftenImprovesNext: string[];
  encouragement?: string;
};

type PhysicalRecoveryTimelineDefinition = {
  substance: RecoverySubstanceCategory;
  label: string;
  shortLabel: string;
  stages: PhysicalRecoveryStageDefinition[];
};

type PhysicalRecoveryStageMatch = {
  substance: RecoverySubstanceCategory;
  substanceLabel: string;
  substanceShortLabel: string;
  currentStage: PhysicalRecoveryStageDefinition;
  nextStage: PhysicalRecoveryStageDefinition | null;
  currentStageStartIso: string;
  nextStageStartIso: string | null;
  daysIntoRecovery: number;
  nowMs: number;
};

export type PhysicalRecoveryDetailItem = {
  id: string;
  title: string;
  stageTimeWindow: string;
  summary: string;
  whatMayBeHappening: string[];
  whatMayFeelNormal: string[];
  whatOftenImprovesNext: string[];
  encouragement?: string;
};

export type PhysicalRecoverySubstanceTrack = {
  substance: RecoverySubstanceCategory;
  substanceLabel: string;
  currentStageLabel: string;
  currentWindowLabel: string;
  nextStageLabel: string | null;
  currentStageStartIso: string;
  nextStageStartIso: string | null;
};

export type PhysicalRecoveryGaugeSummary = {
  id: "mental" | "physical";
  label: string;
  percent: number;
  statusLabel: string;
  supportingText: string;
};

export type PhysicalRecoveryLens = "mental" | "physical";

export type PhysicalRecoveryLensDetail = {
  id: PhysicalRecoveryLens;
  label: string;
  headline: string;
  weekLabel: string;
  stageLabel: string;
  statusLabel: string;
  percent: number;
  summary: string;
  primaryTitle: string;
  primaryPoints: string[];
  secondaryTitle: string;
  secondaryPoints: string[];
  nextTitle: string;
  nextPoints: string[];
  encouragement?: string;
};

export type PhysicalRecoveryTileSummary = {
  hasProfile: boolean;
  headline: string;
  weekLabel: string;
  stageLabel: string;
  snapshot: string;
  nextLabel: string;
  gauges: PhysicalRecoveryGaugeSummary[];
  disclaimer: string;
  ctaLabel: string;
};

export type PhysicalRecoveryViewModel = {
  hasProfile: boolean;
  selectedSubstances: RecoverySubstanceCategory[];
  summary: PhysicalRecoveryTileSummary;
  disclaimer: string;
  lensDetails: Record<PhysicalRecoveryLens, PhysicalRecoveryLensDetail>;
  currentFocus: PhysicalRecoveryDetailItem | null;
  substanceTracks: PhysicalRecoverySubstanceTrack[];
  detailItems: PhysicalRecoveryDetailItem[];
};

const DISCLAIMER =
  "General recovery education only, not medical advice. Healing can continue over time, experiences vary, and urgent symptoms should be evaluated by a medical professional.";

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

const PHYSICAL_RECOVERY_TIMELINES: Record<
  RecoverySubstanceCategory,
  PhysicalRecoveryTimelineDefinition
> = {
  ALCOHOL: {
    substance: "ALCOHOL",
    label: "Alcohol",
    shortLabel: "Alcohol",
    stages: [
      {
        id: "alcohol-early-days",
        label: "Early days",
        windowLabel: "Days 0-7",
        startsAfter: { unit: "days", value: 0 },
        summary:
          "Your body may still be settling after stopping alcohol. Sleep, appetite, and stress response can feel uneven at first.",
        whatMayBeHappening: [
          "Your nervous system may still be calming down after prolonged alcohol exposure.",
          "Hydration, appetite, and sleep patterns may still be trying to normalize.",
          "Energy can swing quickly from fatigue to restlessness in this phase.",
        ],
        whatMayFeelNormal: [
          "Feeling shaky, tired, emotionally reactive, or mentally foggy can be common early on.",
          "Sleep may come in short stretches or feel unrefreshing.",
        ],
        whatOftenImprovesNext: [
          "Sleep and morning clarity often begin to feel more predictable in the coming weeks.",
          "Daily structure and meals may start to feel easier to maintain.",
        ],
        encouragement:
          "The first week can feel uneven, but your body is already shifting toward stability.",
      },
      {
        id: "alcohol-first-weeks",
        label: "First weeks",
        windowLabel: "Days 8-30",
        startsAfter: { unit: "days", value: 8 },
        summary:
          "Many people start noticing steadier mornings and fewer sharp swings, even if cravings and irritability still show up.",
        whatMayBeHappening: [
          "Stress chemistry may still be recalibrating.",
          "Sleep architecture can improve slowly rather than all at once.",
          "Appetite and digestion may be more consistent than they were in the first days.",
        ],
        whatMayFeelNormal: [
          "Mood shifts, vivid dreams, or sudden cravings can still happen.",
          "Some days may feel much better than others even when progress is real.",
        ],
        whatOftenImprovesNext: [
          "Energy, concentration, and emotional steadiness often keep building through the first three months.",
        ],
        encouragement:
          "Improvement is not always linear. Consistency often matters more than how one hard day feels.",
      },
      {
        id: "alcohol-first-90",
        label: "First 90 days",
        windowLabel: "Days 31-90",
        startsAfter: { unit: "days", value: 31 },
        summary:
          "This stage often feels more stable on the outside while the brain keeps adjusting under the surface.",
        whatMayBeHappening: [
          "Reward, stress, and sleep systems may still be rebalancing.",
          "Mental clarity may improve while triggers remain emotionally strong.",
          "Your body may feel better faster than your confidence does.",
        ],
        whatMayFeelNormal: [
          "Feeling better physically but still vulnerable to cravings or old routines can be normal.",
          "Emotional flatness or impatience can still show up even when life looks more stable.",
        ],
        whatOftenImprovesNext: [
          "Mood steadiness, sleep quality, and resilience often keep improving from 3 to 6 months.",
        ],
        encouragement:
          "This is often the phase where routines protect progress. Recovery can keep deepening past the visible early wins.",
      },
      {
        id: "alcohol-three-to-six",
        label: "3-6 months",
        windowLabel: "3-6 months",
        startsAfter: { unit: "months", value: 3 },
        summary:
          "Physical healing may feel less dramatic here, but your body and brain can still be recovering in meaningful ways.",
        whatMayBeHappening: [
          "Sleep, inflammation, and stress recovery may still be improving.",
          "Focus and memory can continue sharpening with stable routines.",
          "Many people notice stronger immunity and steadier energy over time.",
        ],
        whatMayFeelNormal: [
          "You may still have off days or emotional fatigue, especially during stress.",
          "It can be confusing when progress is real but no longer feels dramatic.",
        ],
        whatOftenImprovesNext: [
          "From 6 to 12 months, many people report deeper emotional steadiness and clearer thinking.",
        ],
        encouragement:
          "Healing can continue long after the crisis phase ends. Quiet progress still counts.",
      },
      {
        id: "alcohol-six-to-twelve",
        label: "6-12 months",
        windowLabel: "6-12 months",
        startsAfter: { unit: "months", value: 6 },
        summary:
          "Longer-term healing can show up as steadier energy, better thinking, and fewer stress spikes than early recovery.",
        whatMayBeHappening: [
          "Brain and body systems may still be improving their baseline stability.",
          "Your recovery routines may begin to feel more like identity than emergency management.",
        ],
        whatMayFeelNormal: [
          "Stress can still reactivate cravings or old thought patterns.",
          "You may feel better overall while still recognizing vulnerable moments.",
        ],
        whatOftenImprovesNext: [
          "One year and beyond often brings a stronger sense of trust in your routines and recovery voice.",
        ],
        encouragement: "The work you repeat now often becomes the stability you rely on later.",
      },
      {
        id: "alcohol-one-year-plus",
        label: "1 year+",
        windowLabel: "1 year+",
        startsAfter: { unit: "years", value: 1 },
        summary:
          "Recovery can remain active even after a year. Growth often shifts from getting through the day to protecting the life you are building.",
        whatMayBeHappening: [
          "The body may feel more stable, but recovery still benefits from ongoing maintenance.",
          "Stress recovery, sleep, and emotional regulation can continue strengthening with practice.",
        ],
        whatMayFeelNormal: [
          "Unexpected triggers can still happen even after a long period sober.",
          "You may feel much stronger while still needing structure and support.",
        ],
        whatOftenImprovesNext: [
          "Longer sober time often supports more confidence, emotional range, and resilience during disruption.",
        ],
        encouragement:
          "Long-term recovery is still recovery. Continued healing and growth are possible over time.",
      },
    ],
  },
  OPIOIDS: {
    substance: "OPIOIDS",
    label: "Opioids",
    shortLabel: "Opioids",
    stages: [
      {
        id: "opioids-early-days",
        label: "Early days",
        windowLabel: "Days 0-7",
        startsAfter: { unit: "days", value: 0 },
        summary:
          "The first days can feel physically draining. Your body may be adjusting to the loss of opioid effects on pain, comfort, and sleep.",
        whatMayBeHappening: [
          "Stress systems may feel highly activated.",
          "Sleep, body temperature, appetite, and digestion may feel unsettled.",
          "The body may feel physically raw or overstimulated.",
        ],
        whatMayFeelNormal: [
          "Restlessness, chills, body aches, low mood, and exhaustion can all feel intense early on.",
          "Emotions may feel amplified when the body is uncomfortable.",
        ],
        whatOftenImprovesNext: [
          "The first weeks may bring slower physical settling and fewer sharp body symptoms.",
        ],
        encouragement:
          "Early opioid recovery can feel intense, but intensity does not mean healing has stopped.",
      },
      {
        id: "opioids-first-weeks",
        label: "First weeks",
        windowLabel: "Days 8-30",
        startsAfter: { unit: "days", value: 8 },
        summary:
          "Physical withdrawal may ease while fatigue, sleep disruption, and low motivation can still linger.",
        whatMayBeHappening: [
          "Your reward system may still be underactive.",
          "Sleep and energy can improve slowly instead of all at once.",
          "The body may be less physically distressed but still feel depleted.",
        ],
        whatMayFeelNormal: [
          "Feeling flat, tired, or emotionally blunted can be common.",
          "Cravings may feel tied to stress relief, comfort, or wanting to feel normal.",
        ],
        whatOftenImprovesNext: [
          "From 30 to 90 days, many people notice more stable energy and less constant physical depletion.",
        ],
        encouragement:
          "Even when you are no longer in the worst of it, your brain may still be relearning how to regulate without opioids.",
      },
      {
        id: "opioids-thirty-to-ninety",
        label: "30-90 days",
        windowLabel: "Days 31-90",
        startsAfter: { unit: "days", value: 31 },
        summary:
          "This phase can involve post-acute adjustment. Progress is often real but uneven, especially in sleep, mood, and motivation.",
        whatMayBeHappening: [
          "Reward signaling may still be recovering.",
          "Stress can feel magnified even when physical symptoms are better.",
          "Routine and structure often start to matter more than willpower alone.",
        ],
        whatMayFeelNormal: [
          "Some days may feel numb or low-energy while others feel much more hopeful.",
          "Sleep problems and emotional volatility can still happen in this window.",
        ],
        whatOftenImprovesNext: [
          "From 3 to 6 months, many people report a steadier sense of energy and clearer emotional baseline.",
        ],
        encouragement:
          "A slow recovery arc is still recovery. The goal is not instant relief, it is sustainable healing.",
      },
      {
        id: "opioids-three-to-six",
        label: "3-6 months",
        windowLabel: "3-6 months",
        startsAfter: { unit: "months", value: 3 },
        summary:
          "Energy, sleep, and emotional steadiness may keep improving, even if motivation still comes in waves.",
        whatMayBeHappening: [
          "The brain may still be rebuilding more natural reward and stress responses.",
          "Functioning may improve before joy feels fully consistent.",
        ],
        whatMayFeelNormal: [
          "Periods of discouragement or emotional flatness can still happen.",
          "You may feel physically stronger while still rebuilding confidence.",
        ],
        whatOftenImprovesNext: [
          "From 6 to 12 months, motivation and emotional steadiness often continue to strengthen.",
        ],
        encouragement:
          "It is common for recovery to feel better on the outside before it feels fully settled on the inside.",
      },
      {
        id: "opioids-six-to-twelve",
        label: "6-12 months",
        windowLabel: "6-12 months",
        startsAfter: { unit: "months", value: 6 },
        summary:
          "This stage may bring more trust in your daily rhythm, even if stress and triggers still need active management.",
        whatMayBeHappening: [
          "Sleep, energy, and emotional flexibility may feel more dependable than earlier in recovery.",
          "Recovery skills may start to feel more automatic.",
        ],
        whatMayFeelNormal: [
          "Stress, pain, or isolation can still awaken old urges for relief.",
          "Needing ongoing support does not mean you are behind.",
        ],
        whatOftenImprovesNext: [
          "One year and beyond often brings more stability in how your body and mind handle daily stress.",
        ],
        encouragement:
          "Long-term recovery often grows through repeated ordinary days, not just major breakthroughs.",
      },
      {
        id: "opioids-one-year-plus",
        label: "1 year+",
        windowLabel: "1 year+",
        startsAfter: { unit: "years", value: 1 },
        summary:
          "Longer-term opioid recovery can keep strengthening resilience, clarity, and trust in your routines over time.",
        whatMayBeHappening: [
          "Your baseline stress response may continue to feel steadier than it did in early recovery.",
          "Confidence often grows as sober routines become familiar rather than forced.",
        ],
        whatMayFeelNormal: [
          "Strong reminders of past use can still happen during pain, grief, or isolation.",
          "Recovery may feel more stable while still needing active protection.",
        ],
        whatOftenImprovesNext: [
          "Continued time sober often supports more emotional range, energy stability, and self-trust.",
        ],
        encouragement:
          "Healing can keep unfolding. Protecting your recovery today still matters tomorrow.",
      },
    ],
  },
  METH_STIMULANTS: {
    substance: "METH_STIMULANTS",
    label: "Meth / stimulants",
    shortLabel: "Stimulants",
    stages: [
      {
        id: "stimulants-early-days",
        label: "Early days",
        windowLabel: "Days 0-7",
        startsAfter: { unit: "days", value: 0 },
        summary:
          "Early stimulant recovery can bring heavy fatigue, increased sleep, low mood, and a sense of mental slowdown.",
        whatMayBeHappening: [
          "Your brain may be recovering from intense overstimulation and dopamine depletion.",
          "Sleep pressure can be high while mood and motivation feel low.",
          "Appetite may rebound quickly in the first days.",
        ],
        whatMayFeelNormal: [
          "Sleeping a lot, feeling drained, craving stimulation, or feeling emotionally flat can be common.",
          "Concentration may feel much worse before it starts feeling better.",
        ],
        whatOftenImprovesNext: [
          "Over the first month, energy and sleep can become more predictable even if motivation is still inconsistent.",
        ],
        encouragement:
          "Early stimulant recovery can feel like a crash. Rest and structure still count as recovery work.",
      },
      {
        id: "stimulants-first-weeks",
        label: "First weeks",
        windowLabel: "Days 8-30",
        startsAfter: { unit: "days", value: 8 },
        summary:
          "Energy may still be low, and the contrast between old stimulation and current normal life can feel discouraging.",
        whatMayBeHappening: [
          "Reward and attention systems may still be underpowered.",
          "Sleep can be better than the first week while motivation remains uneven.",
          "The brain may need time before normal tasks feel rewarding again.",
        ],
        whatMayFeelNormal: [
          "Boredom, low drive, emotional flatness, or irritability can still be common.",
          "You may want relief from low energy more than from physical discomfort.",
        ],
        whatOftenImprovesNext: [
          "From 30 to 90 days, concentration, emotional range, and daily structure may start feeling more natural.",
        ],
        encouragement:
          "When normal life feels dull, it does not mean healing is failing. It often means your brain is still recalibrating.",
      },
      {
        id: "stimulants-thirty-to-ninety",
        label: "30-90 days",
        windowLabel: "Days 31-90",
        startsAfter: { unit: "days", value: 31 },
        summary:
          "This window can bring more stability, but motivation and pleasure may still feel inconsistent.",
        whatMayBeHappening: [
          "Attention, sleep, and mood may improve gradually rather than dramatically.",
          "Stress and overstimulation may still trigger strong urges for escape or intensity.",
        ],
        whatMayFeelNormal: [
          "Feeling better than before but still not fully yourself can be common.",
          "Some users describe this phase as improved functioning with uneven enthusiasm.",
        ],
        whatOftenImprovesNext: [
          "From 3 to 6 months, emotional steadiness and concentration often continue building.",
        ],
        encouragement:
          "Recovery from stimulants can take time. Quiet consistency is often part of the healing pattern.",
      },
      {
        id: "stimulants-three-to-six",
        label: "3-6 months",
        windowLabel: "3-6 months",
        startsAfter: { unit: "months", value: 3 },
        summary:
          "By this stage, many people notice more usable energy, more emotional range, and less constant mental drag.",
        whatMayBeHappening: [
          "Attention and reward systems may still be strengthening.",
          "Stress tolerance may improve as sleep and routine become more stable.",
        ],
        whatMayFeelNormal: [
          "Periods of low motivation can still show up, especially during stress or isolation.",
          "Progress may feel easier to see in hindsight than in the moment.",
        ],
        whatOftenImprovesNext: [
          "From 6 to 12 months, many people report stronger concentration and steadier mood.",
        ],
        encouragement:
          "You may still be healing in ways that are not obvious day to day. Time and repetition can matter here.",
      },
      {
        id: "stimulants-six-to-twelve",
        label: "6-12 months",
        windowLabel: "6-12 months",
        startsAfter: { unit: "months", value: 6 },
        summary:
          "This phase often brings more reliable focus and emotional steadiness, even if occasional flat days still happen.",
        whatMayBeHappening: [
          "Cognitive stamina may continue improving with rest, nutrition, and routine.",
          "Triggers may feel more manageable than they did in earlier recovery.",
        ],
        whatMayFeelNormal: [
          "High-stress periods can still bring craving for intensity or escape.",
          "Feeling better overall does not always eliminate vulnerable days.",
        ],
        whatOftenImprovesNext: [
          "One year and beyond often brings stronger stability, resilience, and self-trust.",
        ],
        encouragement:
          "Continued healing can happen over time. Recovery can still deepen after the obvious early changes fade.",
      },
      {
        id: "stimulants-one-year-plus",
        label: "1 year+",
        windowLabel: "1 year+",
        startsAfter: { unit: "years", value: 1 },
        summary:
          "Long-term stimulant recovery can continue strengthening focus, emotional regulation, and confidence in your routines.",
        whatMayBeHappening: [
          "Your baseline may feel more stable and sustainable than it did earlier in recovery.",
          "Stress recovery can still improve as you keep reinforcing sober patterns.",
        ],
        whatMayFeelNormal: [
          "Triggers tied to intensity, isolation, or exhaustion can still show up.",
          "Needing support after a year does not mean progress is not real.",
        ],
        whatOftenImprovesNext: [
          "Ongoing sober time often supports steadier energy, better judgment, and greater resilience during disruption.",
        ],
        encouragement:
          "Long-term recovery still grows through repeated care, not by assuming the work is over.",
      },
    ],
  },
  MARIJUANA: {
    substance: "MARIJUANA",
    label: "Marijuana",
    shortLabel: "Marijuana",
    stages: [
      {
        id: "marijuana-early-days",
        label: "Early days",
        windowLabel: "Days 0-7",
        startsAfter: { unit: "days", value: 0 },
        summary:
          "Early cannabis recovery can bring irritability, sleep disruption, vivid dreams, and a sense of restlessness while the body readjusts.",
        whatMayBeHappening: [
          "Sleep and appetite signals may feel uneven as the body recalibrates without regular THC exposure.",
          "Mood and stress response may feel sharper than expected during the first days.",
          "Dream intensity can increase as REM sleep rebounds.",
        ],
        whatMayFeelNormal: [
          "Feeling edgy, bored, anxious, or having trouble falling asleep can be common early on.",
          "Appetite may dip before it feels more normal again.",
        ],
        whatOftenImprovesNext: [
          "Over the next few weeks, sleep timing and emotional steadiness often start becoming more predictable.",
        ],
        encouragement:
          "Early discomfort does not mean recovery is going badly. A lot of the adjustment here is temporary.",
      },
      {
        id: "marijuana-first-weeks",
        label: "First weeks",
        windowLabel: "Days 8-30",
        startsAfter: { unit: "days", value: 8 },
        summary:
          "This stage often feels less acute, but motivation, sleep quality, and emotional patience may still be settling.",
        whatMayBeHappening: [
          "Sleep can improve gradually while dreams remain unusually vivid.",
          "Stress tolerance may still feel lower than expected in everyday situations.",
          "The mind may still associate downtime or certain routines with using.",
        ],
        whatMayFeelNormal: [
          "Irritability, boredom, or wanting quick relief can still show up.",
          "You may feel better overall while still noticing certain triggers strongly.",
        ],
        whatOftenImprovesNext: [
          "From one to three months, focus, mood consistency, and sleep often feel more stable.",
        ],
        encouragement:
          "This phase can feel quiet but important. New habits often start carrying more weight than willpower alone.",
      },
      {
        id: "marijuana-one-to-three-months",
        label: "1-3 months",
        windowLabel: "1-3 months",
        startsAfter: { unit: "months", value: 1 },
        summary:
          "Many people notice clearer mornings and a steadier baseline here, even if stress or old routines still trigger cravings.",
        whatMayBeHappening: [
          "Energy and motivation may feel less dependent on external stimulation than they did earlier.",
          "Sleep quality can improve more in this window than in the first few weeks.",
          "Emotional awareness may feel stronger without the same urge to numb out quickly.",
        ],
        whatMayFeelNormal: [
          "You may still have nights of rough sleep or moments of wanting the old shortcut.",
          "Some triggers may feel more emotional than physical in this phase.",
        ],
        whatOftenImprovesNext: [
          "From three to six months, stress recovery and consistency often feel more durable.",
        ],
        encouragement:
          "It is common for the gains in this stage to feel subtle day to day. Subtle improvement is still real improvement.",
      },
      {
        id: "marijuana-three-to-six-months",
        label: "3-6 months",
        windowLabel: "3-6 months",
        startsAfter: { unit: "months", value: 3 },
        summary:
          "This period often brings more emotional steadiness and a better sense of what normal life feels like without relying on marijuana.",
        whatMayBeHappening: [
          "Sleep and daily rhythm may feel more stable than earlier recovery.",
          "Stress cues may become easier to recognize before they turn into cravings.",
          "Concentration and follow-through can continue improving with routine.",
        ],
        whatMayFeelNormal: [
          "Stress, isolation, or unstructured time can still wake up old urges.",
          "You may feel more stable overall while still noticing certain rituals or environments strongly.",
        ],
        whatOftenImprovesNext: [
          "Six months and beyond often brings stronger confidence in sober routines and more predictable mood.",
        ],
        encouragement:
          "The more ordinary recovery feels here, the easier it can be to miss the progress. Stability is progress.",
      },
      {
        id: "marijuana-six-months-plus",
        label: "6 months+",
        windowLabel: "6 months+",
        startsAfter: { unit: "months", value: 6 },
        summary:
          "Longer-term marijuana recovery often looks like more trust in your routines, clearer thinking, and fewer automatic urges in everyday moments.",
        whatMayBeHappening: [
          "Your baseline may feel more stable and less tied to immediate relief-seeking.",
          "Stress recovery can keep improving as you keep practicing sober patterns.",
        ],
        whatMayFeelNormal: [
          "Old environments, emotions, or social settings can still light up familiar cravings.",
          "Needing support after many months sober does not cancel out the progress you have made.",
        ],
        whatOftenImprovesNext: [
          "Longer sober time often supports more confidence, clearer boundaries, and better follow-through during stress.",
        ],
        encouragement:
          "Long-term recovery still benefits from care and structure. Feeling stronger does not mean you have to do it alone.",
      },
    ],
  },
  KRATOM: {
    substance: "KRATOM",
    label: "Kratom",
    shortLabel: "Kratom",
    stages: [
      {
        id: "kratom-early-days",
        label: "Early days",
        windowLabel: "Days 0-7",
        startsAfter: { unit: "days", value: 0 },
        summary:
          "Early kratom recovery can feel physically uncomfortable, with restlessness, low mood, sleep disruption, and body symptoms that make the first week feel uneven.",
        whatMayBeHappening: [
          "Your body may be readjusting after regular alkaloid exposure that affected comfort, energy, and mood.",
          "Sleep and body temperature may feel unsettled early on.",
          "The nervous system may feel activated even when you are exhausted.",
        ],
        whatMayFeelNormal: [
          "Body aches, low energy, irritability, stomach upset, and trouble sleeping can all feel pronounced.",
          "Emotions may feel sharper when the body is uncomfortable.",
        ],
        whatOftenImprovesNext: [
          "The first few weeks often bring fewer sharp body symptoms, even if sleep and mood still lag behind.",
        ],
        encouragement:
          "The first week can feel rough, but rough does not mean stuck. Early recovery is often the hardest-looking part.",
      },
      {
        id: "kratom-first-weeks",
        label: "First weeks",
        windowLabel: "Days 8-30",
        startsAfter: { unit: "days", value: 8 },
        summary:
          "Physical intensity may ease here, while motivation, sleep quality, and emotional patience can still be catching up.",
        whatMayBeHappening: [
          "The body may be calmer than in the first week while the brain still feels underpowered.",
          "Sleep may improve slowly rather than all at once.",
          "Mood and energy can still swing unexpectedly.",
        ],
        whatMayFeelNormal: [
          "Feeling better physically but still low-drive or emotionally flat can be common.",
          "Stress can still feel bigger than it did before use became a pattern.",
        ],
        whatOftenImprovesNext: [
          "From one to three months, sleep, mood steadiness, and daily functioning often become more predictable.",
        ],
        encouragement:
          "When progress feels slower than you hoped, structure still helps. Recovery can be working before it feels smooth.",
      },
      {
        id: "kratom-one-to-three-months",
        label: "1-3 months",
        windowLabel: "1-3 months",
        startsAfter: { unit: "months", value: 1 },
        summary:
          "This stage often brings more usable energy and steadier routines, even if cravings or emotional spikes still happen.",
        whatMayBeHappening: [
          "Sleep and stress recovery may feel less fragile than they did earlier.",
          "The brain may still be relearning a more stable reward baseline.",
          "Daily tasks can feel more manageable, even if not fully easy yet.",
        ],
        whatMayFeelNormal: [
          "Wanting quick relief during stress can still show up.",
          "You may feel more stable overall while still being surprised by certain triggers.",
        ],
        whatOftenImprovesNext: [
          "From three to six months, many people notice more confidence in their baseline and less constant symptom-checking.",
        ],
        encouragement:
          "This phase often looks more functional from the outside than it feels on the inside. Keep counting the quieter wins too.",
      },
      {
        id: "kratom-three-to-six-months",
        label: "3-6 months",
        windowLabel: "3-6 months",
        startsAfter: { unit: "months", value: 3 },
        summary:
          "Recovery may feel steadier here, with less physical noise and more room to notice emotional and routine-based patterns clearly.",
        whatMayBeHappening: [
          "Stress response may feel more manageable than in earlier stages.",
          "Sleep, appetite, and day-to-day functioning may be more dependable.",
          "Confidence in sober routines can start replacing fear-based vigilance.",
        ],
        whatMayFeelNormal: [
          "Stressful seasons can still wake up cravings or a desire for quick comfort.",
          "You may feel much better overall and still need support around certain triggers.",
        ],
        whatOftenImprovesNext: [
          "Six months and beyond often brings stronger consistency, self-trust, and resilience during disruption.",
        ],
        encouragement:
          "As the body quiets down, the recovery work often shifts toward protecting the routines that got you here.",
      },
      {
        id: "kratom-six-months-plus",
        label: "6 months+",
        windowLabel: "6 months+",
        startsAfter: { unit: "months", value: 6 },
        summary:
          "Longer-term kratom recovery can continue strengthening sleep, stability, and trust in how you handle stress without reaching for fast relief.",
        whatMayBeHappening: [
          "Your baseline may feel more sustainable and less reactive than it did early on.",
          "Recovery routines may feel more like identity and less like emergency repair.",
        ],
        whatMayFeelNormal: [
          "Old stress patterns can still reactivate cravings or idealized memories of relief.",
          "Needing ongoing support does not mean long-term progress is weak.",
        ],
        whatOftenImprovesNext: [
          "More time sober often supports better resilience, clearer judgment, and stronger recovery confidence.",
        ],
        encouragement:
          "Long-term recovery is still active recovery. The life you are building still deserves protection.",
      },
    ],
  },
};

function parseDateParts(value: string | null): DateParts | null {
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function datePartsToUtcMs(parts: DateParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function formatDatePartsIso(parts: DateParts): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function todayDateParts(nowMs: number): DateParts {
  const now = new Date(nowMs);
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

function addDaysToDateParts(parts: DateParts, days: number): DateParts {
  const next = new Date(datePartsToUtcMs(parts));
  next.setUTCDate(next.getUTCDate() + days);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonthsClamped(parts: DateParts, months: number): DateParts {
  const absoluteMonth = parts.month - 1 + months;
  const year = parts.year + Math.floor(absoluteMonth / 12);
  const monthIndex = ((absoluteMonth % 12) + 12) % 12;
  const month = monthIndex + 1;
  const day = Math.min(parts.day, daysInMonth(year, month));
  return { year, month, day };
}

function addOffset(parts: DateParts, offset: StageOffset): DateParts {
  if (offset.unit === "days") {
    return addDaysToDateParts(parts, offset.value);
  }
  if (offset.unit === "months") {
    return addMonthsClamped(parts, offset.value);
  }
  return addMonthsClamped(parts, offset.value * 12);
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push(normalized);
  }
  return next;
}

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

export function normalizeRecoverySubstances(
  values: RecoverySubstanceCategory[],
): RecoverySubstanceCategory[] {
  const allowed = new Set(RECOVERY_SUBSTANCE_OPTIONS.map((option) => option.value));
  return Array.from(
    new Set(values.filter((value): value is RecoverySubstanceCategory => allowed.has(value))),
  );
}

function getPhysicalRecoveryStageMatch(
  substance: RecoverySubstanceCategory,
  sobrietyDateIso: string,
  nowMs: number,
): PhysicalRecoveryStageMatch | null {
  const start = parseDateParts(sobrietyDateIso);
  if (!start) {
    return null;
  }

  const definition = PHYSICAL_RECOVERY_TIMELINES[substance];
  if (!definition) {
    return null;
  }

  const stagesWithDates = definition.stages.map((stage) => {
    const stageStart = addOffset(start, stage.startsAfter);
    return {
      stage,
      startIso: formatDatePartsIso(stageStart),
      startMs: datePartsToUtcMs(stageStart),
    };
  });

  const todayMs = datePartsToUtcMs(todayDateParts(nowMs));
  let currentIndex = 0;
  for (let index = 0; index < stagesWithDates.length; index += 1) {
    if (todayMs >= stagesWithDates[index].startMs) {
      currentIndex = index;
    } else {
      break;
    }
  }

  const current = stagesWithDates[currentIndex];
  const next = stagesWithDates[currentIndex + 1] ?? null;
  const daysIntoRecovery = Math.max(
    0,
    Math.floor((todayMs - datePartsToUtcMs(start)) / 86_400_000),
  );

  return {
    substance,
    substanceLabel: definition.label,
    substanceShortLabel: definition.shortLabel,
    currentStage: current.stage,
    nextStage: next?.stage ?? null,
    currentStageStartIso: current.startIso,
    nextStageStartIso: next?.startIso ?? null,
    daysIntoRecovery,
    nowMs,
  };
}

function buildCurrentFocus(
  matches: PhysicalRecoveryStageMatch[],
): PhysicalRecoveryDetailItem | null {
  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    const match = matches[0];
    return {
      id: `current-${match.substance}`,
      title: `${match.substanceLabel} recovery right now`,
      stageTimeWindow: match.currentStage.windowLabel,
      summary: match.currentStage.summary,
      whatMayBeHappening: match.currentStage.whatMayBeHappening,
      whatMayFeelNormal: match.currentStage.whatMayFeelNormal,
      whatOftenImprovesNext: match.currentStage.whatOftenImprovesNext,
      encouragement: match.currentStage.encouragement,
    };
  }

  const summaries = matches.map(
    (match) => `${match.substanceShortLabel}: ${match.currentStage.summary}`,
  );
  return {
    id: "current-blended",
    title: "Current priorities in recovery",
    stageTimeWindow: matches
      .map((match) => `${match.substanceShortLabel} • ${match.currentStage.windowLabel}`)
      .join("   "),
    summary:
      "Healing can happen on different timelines when more than one substance is part of recovery. These are the current patterns that may deserve attention most right now.",
    whatMayBeHappening: uniqueNonEmpty([
      ...summaries,
      ...matches.flatMap((match) => match.currentStage.whatMayBeHappening),
    ]),
    whatMayFeelNormal: uniqueNonEmpty(
      matches.flatMap((match) => match.currentStage.whatMayFeelNormal),
    ),
    whatOftenImprovesNext: uniqueNonEmpty(
      matches.flatMap((match) =>
        match.nextStage ? match.nextStage.summary : match.currentStage.whatOftenImprovesNext,
      ),
    ),
    encouragement:
      "Different systems may recover at different speeds. Steady routines can support progress across all of them.",
  };
}

function buildStageDetailItem(input: {
  id: string;
  title: string;
  stageTimeWindow: string;
  summary: string;
  whatMayBeHappening: string[];
  whatMayFeelNormal: string[];
  whatOftenImprovesNext: string[];
  encouragement?: string;
}): PhysicalRecoveryDetailItem {
  return {
    id: input.id,
    title: input.title,
    stageTimeWindow: input.stageTimeWindow,
    summary: input.summary,
    whatMayBeHappening: input.whatMayBeHappening,
    whatMayFeelNormal: input.whatMayFeelNormal,
    whatOftenImprovesNext: input.whatOftenImprovesNext,
    encouragement: input.encouragement,
  };
}

function buildDetailItems(matches: PhysicalRecoveryStageMatch[]): PhysicalRecoveryDetailItem[] {
  const items: PhysicalRecoveryDetailItem[] = [];

  for (const match of matches) {
    items.push(
      buildStageDetailItem({
        id: `timeline-${match.substance}`,
        title: `${match.substanceLabel} timeline`,
        stageTimeWindow: match.currentStage.windowLabel,
        summary: match.currentStage.summary,
        whatMayBeHappening: match.currentStage.whatMayBeHappening,
        whatMayFeelNormal: match.currentStage.whatMayFeelNormal,
        whatOftenImprovesNext: match.nextStage
          ? [match.nextStage.summary, ...match.currentStage.whatOftenImprovesNext]
          : match.currentStage.whatOftenImprovesNext,
        encouragement: match.currentStage.encouragement,
      }),
    );

    if (match.nextStage) {
      items.push(
        buildStageDetailItem({
          id: `timeline-next-${match.substance}`,
          title: `${match.substanceLabel} up next`,
          stageTimeWindow: match.nextStage.windowLabel,
          summary: match.nextStage.summary,
          whatMayBeHappening: match.nextStage.whatMayBeHappening,
          whatMayFeelNormal: match.nextStage.whatMayFeelNormal,
          whatOftenImprovesNext: match.nextStage.whatOftenImprovesNext,
          encouragement: match.nextStage.encouragement,
        }),
      );
    }
  }

  return items;
}

function computeStageJourney(match: PhysicalRecoveryStageMatch): number {
  const stages = PHYSICAL_RECOVERY_TIMELINES[match.substance].stages;
  const currentIndex = stages.findIndex((stage) => stage.id === match.currentStage.id);
  if (currentIndex < 0) {
    return 0;
  }
  if (stages.length <= 1) {
    return 1;
  }

  let withinStageProgress = 0;
  if (match.nextStageStartIso) {
    const currentStageStartMs = Date.parse(match.currentStageStartIso);
    const nextStageStartMs = Date.parse(match.nextStageStartIso);
    const elapsedMs = match.nowMs - currentStageStartMs;
    const stageDurationMs = nextStageStartMs - currentStageStartMs;
    if (Number.isFinite(elapsedMs) && Number.isFinite(stageDurationMs) && stageDurationMs > 0) {
      withinStageProgress = Math.max(0, Math.min(1, elapsedMs / stageDurationMs));
    }
  } else if (currentIndex === stages.length - 1) {
    withinStageProgress = 1;
  }

  return Math.max(0, Math.min(1, (currentIndex + withinStageProgress) / (stages.length - 1)));
}

function gaugeStatusLabel(kind: "mental" | "physical", percent: number): string {
  if (kind === "physical") {
    if (percent < 30) {
      return "Early repair";
    }
    if (percent < 55) {
      return "Rebuilding";
    }
    if (percent < 80) {
      return "Strengthening";
    }
    return "Steadying";
  }

  if (percent < 30) {
    return "Resetting";
  }
  if (percent < 55) {
    return "Rewiring";
  }
  if (percent < 80) {
    return "Clarifying";
  }
  return "Stabilizing";
}

function buildGaugeSummary(matches: PhysicalRecoveryStageMatch[]): PhysicalRecoveryGaugeSummary[] {
  if (matches.length === 0) {
    return [
      {
        id: "mental",
        label: "Mental repair",
        percent: 0,
        statusLabel: "Not set",
        supportingText: "Add substances to personalize this recovery snapshot.",
      },
      {
        id: "physical",
        label: "Physical repair",
        percent: 0,
        statusLabel: "Not set",
        supportingText: "Add substances to personalize this recovery snapshot.",
      },
    ];
  }

  const averageJourney =
    matches.reduce((sum, match) => sum + computeStageJourney(match), 0) / matches.length;
  const physicalPercent = clampPercent(18 + averageJourney * 80);
  const mentalPercent = clampPercent(12 + Math.max(0, averageJourney - 0.1) * 82);

  return [
    {
      id: "mental",
      label: "Mental repair",
      percent: mentalPercent,
      statusLabel: gaugeStatusLabel("mental", mentalPercent),
      supportingText: "Brain recovery often trails the body, even when progress is real.",
    },
    {
      id: "physical",
      label: "Physical repair",
      percent: physicalPercent,
      statusLabel: gaugeStatusLabel("physical", physicalPercent),
      supportingText:
        "Body repair often becomes easier to feel before confidence fully catches up.",
    },
  ];
}

function averageRecoveryWeek(matches: PhysicalRecoveryStageMatch[]): number {
  if (matches.length === 0) {
    return 1;
  }
  const averageDays =
    matches.reduce((sum, match) => sum + match.daysIntoRecovery, 0) / matches.length;
  return Math.max(1, Math.floor(averageDays / 7) + 1);
}

function buildLensDetail(
  lens: PhysicalRecoveryLens,
  matches: PhysicalRecoveryStageMatch[],
  gauges: PhysicalRecoveryGaugeSummary[],
): PhysicalRecoveryLensDetail {
  const gauge = gauges.find((entry) => entry.id === lens) ?? {
    id: lens,
    label: lens === "mental" ? "Mental repair" : "Physical repair",
    percent: 0,
    statusLabel: "Not set",
    supportingText: "Add substances to personalize this recovery snapshot.",
  };
  const weekLabel = `Recovery week ${averageRecoveryWeek(matches)}`;

  if (matches.length === 0) {
    return {
      id: lens,
      label: gauge.label,
      headline: lens === "mental" ? "Brain chemistry and emotions" : "Body repair and presentation",
      weekLabel,
      stageLabel: "No recovery profile selected",
      statusLabel: gauge.statusLabel,
      percent: gauge.percent,
      summary: "Select substances in your recovery profile to unlock this weekly recovery view.",
      primaryTitle:
        lens === "mental"
          ? "What may be happening in your brain chemistry"
          : "What physical healing may still be happening",
      primaryPoints: ["Add substances to personalize this recovery snapshot."],
      secondaryTitle:
        lens === "mental" ? "What to expect in thoughts and emotions" : "How this usually presents",
      secondaryPoints: ["Your current recovery window will appear here once a profile is set."],
      nextTitle: "What often improves next",
      nextPoints: ["As your timeline progresses, this view will update automatically."],
      encouragement: undefined,
    };
  }

  const stageLabel = uniqueNonEmpty(
    matches.map((match) => `${match.substanceShortLabel} • ${match.currentStage.windowLabel}`),
  ).join("   ");
  const summary =
    lens === "mental"
      ? matches.length === 1
        ? `${matches[0].substanceLabel} recovery often affects stress chemistry, mood, thinking, and emotional range before it feels fully settled.`
        : "Different substances can affect reward, stress, sleep, and emotional regulation on overlapping timelines."
      : matches.length === 1
        ? `${matches[0].substanceLabel} recovery can still involve body-level healing in sleep, energy, appetite, digestion, and stress recovery during this window.`
        : "Physical recovery can move at different speeds across substances, especially in sleep, energy, appetite, and stress response.";
  const encouragement = uniqueNonEmpty(
    matches
      .map((match) => match.currentStage.encouragement ?? null)
      .filter((value): value is string => Boolean(value)),
  ).join(" ");

  return {
    id: lens,
    label: gauge.label,
    headline: lens === "mental" ? "Brain chemistry and emotions" : "Body repair and presentation",
    weekLabel,
    stageLabel,
    statusLabel: gauge.statusLabel,
    percent: gauge.percent,
    summary,
    primaryTitle:
      lens === "mental"
        ? "What may be happening in your brain chemistry"
        : "What physical healing may still be happening",
    primaryPoints:
      lens === "mental"
        ? uniqueNonEmpty(matches.flatMap((match) => match.currentStage.whatMayBeHappening))
        : uniqueNonEmpty(
            matches.map((match) => `${match.substanceLabel}: ${match.currentStage.summary}`),
          ),
    secondaryTitle:
      lens === "mental" ? "What to expect in thoughts and emotions" : "How this usually presents",
    secondaryPoints: uniqueNonEmpty(
      matches.flatMap((match) => match.currentStage.whatMayFeelNormal),
    ),
    nextTitle: "What often improves next",
    nextPoints: uniqueNonEmpty(
      matches.flatMap((match) =>
        match.nextStage
          ? [match.nextStage.summary, ...match.currentStage.whatOftenImprovesNext]
          : match.currentStage.whatOftenImprovesNext,
      ),
    ),
    encouragement: encouragement || undefined,
  };
}

function buildTileSummary(matches: PhysicalRecoveryStageMatch[]): PhysicalRecoveryTileSummary {
  const weekLabel = `Recovery week ${averageRecoveryWeek(matches)}`;
  if (matches.length === 0) {
    return {
      hasProfile: false,
      headline: "Add recovery profile details",
      weekLabel,
      stageLabel: "Personalize this timeline",
      snapshot:
        "Select substances in your recovery profile to get a stage-based guide for what the body and brain may still be working through.",
      nextLabel:
        "Add alcohol, opioids, meth/stimulants, marijuana, or kratom in Recovery Settings.",
      gauges: buildGaugeSummary(matches),
      disclaimer: DISCLAIMER,
      ctaLabel: "Open Recovery Settings",
    };
  }

  if (matches.length === 1) {
    const match = matches[0];
    return {
      hasProfile: true,
      headline: "Recovery Repair",
      weekLabel,
      stageLabel: `${match.substanceLabel} • ${match.currentStage.label}`,
      snapshot: match.currentStage.summary,
      nextLabel: match.nextStage
        ? `Next: ${match.nextStage.label}`
        : "Next: Long-term healing can continue over time",
      gauges: buildGaugeSummary(matches),
      disclaimer: DISCLAIMER,
      ctaLabel: "View timeline",
    };
  }

  const stageLabels = uniqueNonEmpty(matches.map((match) => match.currentStage.label));
  return {
    hasProfile: true,
    headline: "Recovery Repair",
    weekLabel,
    stageLabel: stageLabels.length === 1 ? stageLabels[0] : "Multiple recovery timelines",
    snapshot: `${matches
      .map((match) => match.substanceShortLabel)
      .join(
        " + ",
      )} may heal on overlapping timelines. The current feed blends what may matter most right now.`,
    nextLabel: `Next: ${
      uniqueNonEmpty(
        matches
          .map((match) => match.nextStage?.label ?? null)
          .filter((value): value is string => Boolean(value)),
      ).join(" • ") || "Ongoing long-term recovery"
    }`,
    gauges: buildGaugeSummary(matches),
    disclaimer: DISCLAIMER,
    ctaLabel: "View timeline",
  };
}

export function buildPhysicalRecoveryViewModel(input: {
  sobrietyDateIso: string | null;
  nowMs: number;
  substances: RecoverySubstanceCategory[];
}): PhysicalRecoveryViewModel {
  const selectedSubstances = normalizeRecoverySubstances(input.substances);
  if (!input.sobrietyDateIso || selectedSubstances.length === 0) {
    const summary = buildTileSummary([]);
    const lensDetails = {
      mental: buildLensDetail("mental", [], summary.gauges),
      physical: buildLensDetail("physical", [], summary.gauges),
    } satisfies Record<PhysicalRecoveryLens, PhysicalRecoveryLensDetail>;
    return {
      hasProfile: false,
      selectedSubstances,
      summary,
      disclaimer: DISCLAIMER,
      lensDetails,
      currentFocus: null,
      substanceTracks: [],
      detailItems: [],
    };
  }

  const matches = selectedSubstances
    .map((substance) =>
      getPhysicalRecoveryStageMatch(substance, input.sobrietyDateIso as string, input.nowMs),
    )
    .filter((match): match is PhysicalRecoveryStageMatch => match !== null);

  const detailItems = buildDetailItems(matches);
  const summary = buildTileSummary(matches);
  const lensDetails = {
    mental: buildLensDetail("mental", matches, summary.gauges),
    physical: buildLensDetail("physical", matches, summary.gauges),
  } satisfies Record<PhysicalRecoveryLens, PhysicalRecoveryLensDetail>;
  const currentFocus = buildCurrentFocus(matches);

  return {
    hasProfile: matches.length > 0,
    selectedSubstances,
    summary,
    disclaimer: DISCLAIMER,
    lensDetails,
    currentFocus,
    substanceTracks: matches.map((match) => ({
      substance: match.substance,
      substanceLabel: match.substanceLabel,
      currentStageLabel: match.currentStage.label,
      currentWindowLabel: match.currentStage.windowLabel,
      nextStageLabel: match.nextStage?.label ?? null,
      currentStageStartIso: match.currentStageStartIso,
      nextStageStartIso: match.nextStageStartIso,
    })),
    detailItems,
  };
}
