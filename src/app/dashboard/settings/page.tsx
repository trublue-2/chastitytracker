import SettingsForm from "./SettingsForm";
import { getSettingsProps } from "./getSettingsProps";

export default async function SettingsPage() {
  const props = await getSettingsProps();
  return <SettingsForm {...props} />;
}
