import { getSettings } from "@/lib/settings";
import IncomePage from "./IncomePage";

export default async function Page() {
  const settings = await getSettings();
  return <IncomePage displayCurrency={settings.displayCurrency} />;
}
