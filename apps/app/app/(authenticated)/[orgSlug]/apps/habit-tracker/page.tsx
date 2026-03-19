import { Header } from "../../../components/header";
import { HabitTrackerApp } from "./habit-tracker-app";

export default function HabitTrackerPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Header page="Habit Tracker" pages={["Apps"]} />
      <HabitTrackerApp />
    </div>
  );
}
