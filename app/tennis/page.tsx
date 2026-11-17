import SportPage from "../sport-page";
import { redirect } from "next/navigation";
import { isSportVisible } from "@/lib/sports";

export default function TennisPage() {
  if (!isSportVisible("tennis")) redirect("/padel/");
  return <SportPage sport="tennis" />;
}
