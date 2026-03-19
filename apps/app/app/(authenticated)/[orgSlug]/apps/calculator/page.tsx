import { Header } from "../../../components/header";
import { CalculatorApp } from "./calculator-app";

export default function CalculatorPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Header page="Calculator" pages={["Apps"]} />
      <CalculatorApp />
    </div>
  );
}
