import { Header } from "../../../components/header";
import { MeetingCostApp } from "./meeting-cost-app";

export default function MeetingCostPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Header page="Meeting Cost Calculator" pages={["Apps"]} />
      <MeetingCostApp />
    </div>
  );
}
