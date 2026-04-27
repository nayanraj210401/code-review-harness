import type { IFormatter } from "./base";
import type { ReviewSession } from "../types/review";

export const jsonFormatter: IFormatter = {
  name: "json",
  mimeType: "application/json",
  fileExtension: ".json",
  format(session: ReviewSession): string {
    return JSON.stringify(session, null, 2);
  },
};
