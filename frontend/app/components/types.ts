export type AnswerCard = {
  title: string;
  description: string;
  tag?: string;
  bullets?: string[];
};

export type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  cards?: AnswerCard[];
};
