export type DepartmentCategory = "central" | "state" | "enforcement" | "other";

export interface DepartmentInfo {
  name: string;
  category: DepartmentCategory;
}

export const DEPARTMENT_LIST: DepartmentInfo[] = [
  { name: "Ministry of Home Affairs", category: "central" },
  { name: "Ministry of Finance", category: "central" },
  { name: "Ministry of Law & Justice", category: "central" },
  { name: "Ministry of Health & Family Welfare", category: "central" },
  { name: "Ministry of Education", category: "central" },
  { name: "Ministry of Environment, Forest & Climate Change", category: "central" },
  { name: "Ministry of Agriculture & Farmers Welfare", category: "central" },
  { name: "Ministry of Defence", category: "central" },
  { name: "Ministry of External Affairs", category: "central" },
  { name: "Ministry of Commerce & Industry", category: "central" },
  { name: "Ministry of Labour & Employment", category: "central" },
  { name: "Ministry of Social Justice & Empowerment", category: "central" },
  { name: "Ministry of Women & Child Development", category: "central" },
  { name: "Ministry of Housing & Urban Affairs", category: "central" },
  { name: "Ministry of Rural Development", category: "central" },
  { name: "Ministry of Power", category: "central" },
  { name: "Ministry of Railways", category: "central" },
  { name: "Ministry of Road Transport & Highways", category: "central" },
  { name: "Ministry of Tribal Affairs", category: "central" },
  { name: "Ministry of Information & Broadcasting", category: "central" },
  { name: "Ministry of Petroleum & Natural Gas", category: "central" },
  { name: "Revenue Department (State)", category: "state" },
  { name: "Police Department (State)", category: "state" },
  { name: "Public Works Department (State)", category: "state" },
  { name: "Forest Department (State)", category: "state" },
  { name: "Municipal Corporation / Urban Local Body", category: "state" },
  { name: "District Administration", category: "state" },
  { name: "State Health Department", category: "state" },
  { name: "State Education Department", category: "state" },
  { name: "State Finance Department", category: "state" },
  { name: "State Agriculture Department", category: "state" },
  { name: "State Home Department", category: "state" },
  { name: "Central Bureau of Investigation", category: "enforcement" },
  { name: "Enforcement Directorate", category: "enforcement" },
  { name: "Income Tax Department", category: "enforcement" },
  { name: "Customs & Central Excise", category: "enforcement" },
  { name: "High Court Registry", category: "enforcement" },
  { name: "Other / Not Specified", category: "other" },
];

export const DEPARTMENT_NAMES = DEPARTMENT_LIST.map((d) => d.name);

export function getDepartmentInfo(name: string): DepartmentInfo {
  return (
    DEPARTMENT_LIST.find((d) => d.name === name) ?? {
      name,
      category: "other",
    }
  );
}
