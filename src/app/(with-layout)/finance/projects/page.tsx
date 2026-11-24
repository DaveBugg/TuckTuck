import { getSettings } from "@/lib/settings";
import ProjectsPage from "./ProjectsPage";

export default async function Page() {
  const settings = await getSettings();
  return <ProjectsPage displayCurrency={settings.displayCurrency} />;
}
