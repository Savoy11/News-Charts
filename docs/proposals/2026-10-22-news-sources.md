# New news sources — a shortlist, measured — 2026-10-22

**Item:** NC-095 ("Pick a fresh news-repository candidate"), feeding the `P2` "Research more news
repositories" entry in `docs/MASTER-CHECKLIST.md` · **Commit:** e5493f1 (main after batch 28) ·
**Where it ran:** the cloud build container, live requests through its proxy · **Nothing was built.**

> The owner chose this as batch 29: find a free source, test what it returns for a few companies,
> and report its licence before building anything.
>
> - **The hole it is meant to fill** is the one `docs/COVERAGE-MAP.md` calls the biggest: 1963 to
>   2017. Chronicling America stops around 1963, and GDELT starts in 2017.
> - **The bar:** free, no paid tier, and cleared for commercial use. `COMMERCIAL_MODE` must be on
>   before anyone but the owner loads a page (D22), so a non-commercial free tier is no use. That
>   rules out the eight keyed aggregators already dropped (NYT, Guardian, Newsdata, GNews,
>   Currents, Marketaux, EODHD, Finnhub).
> - **What was found:** no free news-article archive covering 1963–2017 clears that bar. Every
>   candidate below is a primary record — a government release or a recall notice — not
>   journalism. They are dated, name the company, and are the kind of event a price move follows.
> - **Ranked** by how much of the hole they fill for listed companies, then by breadth:
>   1 · NHTSA vehicle recalls — 2 · Justice Department press releases — 3 · FDA enforcement
>   reports — 4 · CPSC product recalls. Then two that are not new sources, and three not shortlisted.

Mark each candidate `APPROVED`, `REJECTED` or `DEFERRED`. Only an approved one gets built.

---

## 1. NHTSA vehicle recalls — 1966 to today, public domain · recommended first

**Status:** awaiting the owner

- **What it is:** every safety recall campaign filed with the National Highway Traffic Safety
  Administration since 1966: the maker, the date the defect report arrived, the component, the
  number of vehicles, and a defect summary.
- **How it is read:** two files with no key, `FLAT_RCL_PRE_2010.zip` (7.5 MB) and
  `FLAT_RCL_POST_2010.zip` (14.9 MB), in NHTSA's downloads folder and updated daily, with the
  field guide `RCL.txt`. Tab-separated, dates as YYYYMMDD. There is also a keyless API, but it
  needs a make, model and year, so the files suit a whole-company read better.
- **Licence:** US government data. The federal data catalog lists the recalls flat file as public
  domain (`us-pd`, the usa.gov public domain label).
- **Measured** (30,391 campaigns in all; one campaign counted once):

  | Company | Campaigns | 1966–2016 | 100,000+ vehicles | First |
  | --- | --- | --- | --- | --- |
  | Ford (F) | 1,748 | 1,118 | 402 | 1966-10-06 |
  | General Motors (GM) | 1,714 | 1,428 | 321 | 1966-01-19 |
  | Chrysler / FCA / Stellantis (STLA) | 1,551 | 1,115 | 297 | 1966-09-29 |
  | Honda (HMC) | 479 | 303 | 127 | 1966-09-29 |
  | Toyota (TM) | 427 | 267 | 141 | 1967-06-23 |
  | Paccar (PCAR) | 474 | 376 | 6 | 1968-05-24 |
  | Harley-Davidson (HOG) | 208 | 178 | 10 | 1967-03-09 |
  | Tesla (TSLA) | 96 | 7 | 20 | 2009-05-26 |
  | Polaris (PII) | 73 | 57 | 0 | 1997-11-07 |
  | Goodyear (GT) | 60 | 51 | 2 | 1970-07-09 |

- **Why first:** it is the only candidate that reaches deep into 1963–2017, with hundreds of
  dated, company-named events per company. A large recall is the kind of event a price move
  follows. Pages would show the big ones, for example only campaigns over a vehicle-count floor.
- **Limits:** one sector (cars, trucks, motorcycles, tyres, RVs). The maker is written NHTSA's way
  ("FORD MOTOR COMPANY", "FCA US LLC", and in one old row "FORD MOTOR COMPANY test adw as"), so
  it needs a small, checked map from maker names to listed companies, not a fuzzy match.

## 2. Justice Department press releases — 2009 to today, public domain

**Status:** awaiting the owner

- **What it is:** the Department's press releases: settlements, guilty pleas, civil suits and
  antitrust actions, many naming a listed company.
- **How it is read:** a keyless JSON API, `https://www.justice.gov/api/v1/press_releases.json`,
  with a title filter, 50 a page.
- **Licence:** justice.gov's legal policies page: "Unless otherwise indicated, information on
  Department of Justice websites is in the public domain and may be copied and distributed without
  permission." Photos and graphics may be copyrighted; a timeline uses only the title, date and link.
- **Measured** (releases whose title contains the name):

  | Name searched | Releases | Before 2017 | First |
  | --- | --- | --- | --- |
  | Apple | 152 | 43 | 2012-02-13 |
  | Wells Fargo | 68 | 36 | 2011-05-31 |
  | Boeing | 29 | 14 | 2009-07-16 |
  | Exxon | 18 | 13 | 2009-08-13 |
  | Pfizer | 12 | 5 | 2011-10-21 |
  | Goldman Sachs | 12 | 4 | 2013-04-03 |
  | Johnson & Johnson | 10 | 9 | 2009-02-19 |
  | Ford Motor | 4 | 1 | 2010-06-04 |

- **Why second:** every sector, and the events are material ("Boeing Company to Pay U.S. $25
  Million…", "Goldman Sachs Agrees to Pay More than $5 Billion…").
- **Limits:** it starts in 2009, so it fills only the end of the hole. A title match takes
  namesakes: "Apple" returns "Apple Tree Children's Center", and many releases name a former
  employee rather than the company. It would need the Federal Register's rule, the title naming
  the company with a company word after a one-word name (`lib/frCompany.ts`).

## 3. FDA enforcement reports — 2012 to today, CC0

**Status:** awaiting the owner

- **What it is:** drug, medical-device and food recalls from the FDA's weekly enforcement report.
- **How it is read:** openFDA's keyless API, `https://api.fda.gov/{drug,device,food}/enforcement.json`,
  searching `recalling_firm`. Without a key it allows 1,000 requests a day; a free key raises that.
- **Licence:** open.fda.gov/license: public domain under CC0 1.0, "even for commercial purposes",
  except copyrighted works marked as such.
- **Measured** (records, drug / device / food; a recall of several products is several records):

  | Firm searched | Drug | Device | Food | First |
  | --- | --- | --- | --- | --- |
  | Medtronic | 0 | 1,270 | 0 | 2012-06-27 |
  | Abbott | 5 | 357 | 72 | 2012-06-27 |
  | Pfizer | 156 | 5 | 0 | 2012-06-20 |
  | Johnson & Johnson | 24 | 87 | 0 | 2012-07-11 |
  | Kraft | 0 | 0 | 58 | 2012-10-31 |
  | Tyson | 0 | 0 | 7 | 2017-06-07 |

- **Limits:** it starts in mid-2012, so it adds depth for health and food companies rather than
  filling the hole. Records must be grouped into recalls, and firms file under subsidiaries
  ("DePuy Mitek, Inc., a Johnson & Johnson Co.", "Hospira Inc., A Pfizer Company").

## 4. CPSC product recalls — 1973 to today, public domain

**Status:** awaiting the owner

- **What it is:** consumer-product recalls: toys, tools, appliances, furniture.
- **How it is read:** a keyless REST service, `https://www.saferproducts.gov/RestWebServices/Recall?format=json`.
  The whole set is one 28 MB answer (10,053 recalls, the first on 1973-06-08).
- **Licence:** the federal data catalog lists the Recalls API under the usa.gov public domain label.
- **Measured** (recalls with the company as the maker):

  | Company | As maker | Before 2017 | First |
  | --- | --- | --- | --- |
  | Polaris (PII) | 104 | 45 | 1987-11-19 |
  | Walmart (WMT), own brands | 41 | 41 | 1984-11-06 |
  | Mattel (MAT) | 33 | 33 | 1978-12-08 |
  | Stanley Black & Decker (SWK) | 30 | 29 | 1977-08-17 |
  | Target (TGT), own brands | 29 | 29 | 1989-02-02 |
  | GE (GE) | 22 | 21 | 1979-05-21 |
  | Hasbro (HAS) | 16 | 15 | 1985-08-05 |
  | Whirlpool (WHR) | 14 | 12 | 1987-06-23 |

- **Limits:** tens per company, not hundreds. Counting a retailer that only sold the product
  (Walmart appears on 709 recalls in all) would fill its page with other makers' news, so only the
  maker should count.

---

## Not new sources, but worth knowing

- **The press release inside each 8-K.** Ford filed 451 8-Ks in 2001–2016, Boeing 199 and Apple
  130. They are already on the timeline (the shards are read), titled by their item ("Other
  events"). About half carry the company's press release as an exhibit, whose headline would make
  a better title: "Ford Motor Company Posts Gains Across Cars, Utilities, Trucks in May", "Boeing
  Reports Strong First-Quarter Results". The headline is hard to pick out reliably — samples gave
  "TEXT OF PRESS RELEASE ISSUED BY APPLE INC. DATED JULY 21, 2008." and a file name — and it costs
  two EDGAR requests per filing. An enrichment of existing events, not a new source.
- **Wikipedia's daily "Current events" pages** (CC BY-SA, the licence the site already uses for
  Wikipedia text) list each day's news. Not tested, so how far back they reach and how often they
  name a listed company is unknown: Wikipedia answered this session with "too many requests".

## Not shortlisted

- **SEC enforcement releases.** Their year pages reach back to 1995, but the site's search box
  ignores the search term, so finding a company means reading every year's pages, and the latest
  page of litigation releases named individuals and small firms only.
- **GDELT's television archive** (captions from 2009). Its terms for caption text are not stated
  where they could be found, and GDELT refuses this session.
- **The eight keyed aggregators**: non-commercial free tiers, dropped on 2026-10-19.

## Method

Live requests from the cloud container on 2026-10-22. The recall files and the CPSC answer were
downloaded and counted offline. NHTSA campaigns are counted once each, on the date the defect
report arrived. FDA and CPSC counts are what each service returns for the name; Justice Department
counts are releases whose title contains it. EDGAR was read with the app's own contact
`User-Agent`, within its 10-a-second limit. Licence statements are quoted from each agency's own
page where it could be read from here; NHTSA's and CPSC's sites refuse automated requests, so for
those two the federal data catalog's licence field is the source.
