import { Header } from "../../../components/header";
import { WorldClockApp } from "./world-clock-app";

export default function WorldClockPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Header page="World Clock" pages={["Apps"]} />
      <WorldClockApp />
    </div>
  );
}
