import { PayablesSchedule } from "@/src/modules/payables/frontend/payables-schedule";

/** Payment scheduling and batch authorization (CXP-013–015).
 * @returns The schedule page.
 */
export default function PayablesSchedulePage(): React.JSX.Element {
  return <PayablesSchedule />;
}
