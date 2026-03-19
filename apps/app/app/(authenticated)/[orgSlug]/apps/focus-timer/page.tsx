import { Header } from "../../../components/header";
import { FocusTimerApp } from "./focus-timer-app";

export default function FocusTimerPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Header page="Focus Timer" pages={["Apps"]} />
      <FocusTimerApp />
    </div>
  );
}
