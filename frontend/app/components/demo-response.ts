import type { AnswerCard } from "./types";

export function createDemoResponse(question: string): {
  content: string;
  cards: AnswerCard[];
} {
  const q = question.toLowerCase();

  if (q.includes("shelter")) {
    return {
      content: "Here are the key things to check when looking for an emergency shelter.",
      cards: [
        {
          title: "Confirm current status",
          description: "Check official local emergency management updates before travelling. This demo does not have live shelter data.",
          tag: "Verify first",
          bullets: ["Check whether the location is open", "Look for capacity or accessibility updates"],
        },
        {
          title: "Plan a safe route",
          description: "Follow official evacuation routes and avoid roads reported as closed or hazardous.",
          tag: "Travel",
        },
        {
          title: "Bring essentials",
          description: "If safe to do so, bring identification, needed medication, water, a phone charger, and essential supplies.",
          tag: "Prepare",
        },
      ],
    };
  }

  if (q.includes("go-bag") || q.includes("supplies") || q.includes("pack")) {
    return {
      content: "A basic emergency kit can help you stay prepared if you need to leave quickly.",
      cards: [
        {
          title: "Water and food",
          description: "Pack drinking water and non-perishable food appropriate for your household.",
          tag: "Essentials",
        },
        {
          title: "Health and safety",
          description: "Include necessary medication, a first-aid kit, a flashlight, batteries, and hygiene supplies.",
          tag: "Safety",
        },
        {
          title: "Information and power",
          description: "Bring identification, important contact information, a phone charger or power bank, and a battery-powered radio if available.",
          tag: "Stay connected",
        },
      ],
    };
  }

  return {
    content: `I can help you think through next steps for: "${question}". First, prioritize immediate safety and check official local instructions.`,
    cards: [
      {
        title: "1. Check immediate danger",
        description: "If there is an immediate threat to life, move away from danger if you can do so safely and contact local emergency services.",
        tag: "Priority",
      },
      {
        title: "2. Follow official instructions",
        description: "Use alerts and instructions from local emergency management, fire, police, or other responsible authorities.",
        tag: "Official updates",
      },
      {
        title: "3. Verify before acting",
        description: "Conditions can change quickly. Confirm shelter status, road closures, and other time-sensitive details before relying on them.",
        tag: "Current information",
      },
    ],
  };
}
