import { nameKey } from "./companyAliases";

/**
 * The everyday names two listed records share that are one group's, not two companies' (batch 109,
 * the 2026-11-07 audit's question 2). Every other everyday name two listed companies share names
 * neither alone (`listedCompaniesNamed` in lib/sec.ts): "Independent Bank" is the Massachusetts
 * bank's (INDB) and the Michigan bank's (IBCP), "Toro" the mower maker's (TTC) and a shipping
 * company's (TORO). Of the twelve the committed index holds (2026-11-07), these three are one
 * company under two records, each read here; `check:shared-names` lists the twelve.
 */
export const ONE_GROUP: Readonly<Record<string, string>> = {
  "RIO TINTO": "Rio Tinto plc (RIO, record 863064) and Rio Tinto Limited (RTNTF, 887028), the two halves of one dual-listed group",
  "RESOLUTION MINERALS": "Resolution Minerals Ltd (RML, 2102907) and its depositary's ADR record (RLMLF, 2086869), which files only Form F-6",
  WISEQEY:
    "WISeQey Corp. (WQEY, 2107968), the parent that succeeded WISeKey International Holding (WSKEF, 1738699) by its 8-K12B of 2026; the old record has since filed its Form 15",
};

/** Whether an everyday name two listed records share is one group's, and so still names it. */
export const isOneGroupName = (everyday: string): boolean => nameKey(everyday) in ONE_GROUP;
