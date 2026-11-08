import pkg from "../../../package.json";
import { publicIdentity } from "@/lib/upstream/census";
import { feedbackMode, githubIssueHref, type FeedbackSetup } from "@/lib/upstream/feedback";

/** Modus und GitHub-Link des Feedback-Knopfs — serverseitig, weil die öffentliche Kennung in der
 *  Datenbank liegt. */
export async function feedbackSetup(): Promise<FeedbackSetup> {
  const { publicId, image } = await publicIdentity();
  return {
    mode: feedbackMode(),
    githubHref: githubIssueHref({ version: pkg.version, publicId, image }),
  };
}
