# ERP / back-office module

The mock-up also contains an ERP-style area with 13 apps and 29 business models (plus 22 `cx.*` views over the CRM objects).

## Apps

|  | App | Menus |
| --- | --- | --- |
| ☐ | Contacts | Contacts · Configuration |
| ☐ | CRM | Pipeline · Sales · Reporting |
| ☐ | Sales | Orders · Products · Reporting |
| ☐ | Purchase | Orders · Products · Reporting |
| ☐ | Inventory | Operations · Products · Reporting · Configuration |
| ☐ | Manufacturing | Operations · Products · Reporting |
| ☐ | Project | Projects · Tasks · Reporting |
| ☐ | Timesheets | My Timesheets · All Timesheets · Reporting |
| ☐ | Expenses | My Expenses · All Expenses · To Approve · To Post |
| ☐ | Employees | Employees · Configuration |
| ☐ | Settings | General Settings |
| ☐ | Accounting | Dashboard · Customers · Vendors · Accounting · Reporting · Configuration |
| ☐ | Records | Leads · Accounts · Contacts · Opportunities · Cases · Campaigns · Tasks · Events · Products · Quotes · Contracts · Employees · Job Openings · Candidates · Time Off Requests · Knowledge Articles · Work Orders · Service Appointments · Service Resources · Assets · Price Books · Data Streams |

## Models (29)

|  | Model | Label | Fields |
| --- | --- | --- | --- |
| ☐ | res.partner | Contact | name: char*; kind: sel; email: char; phone: char; street: char; city: char; country: char; vat: char; rank: sel; term: m2o; notes: text |
| ☐ | product.product | Product | name: char*; ref: char; type: sel; category: sel; price: money; cost: money; onhand: num; stax: m2o; ptax: m2o; desc: text |
| ☐ | crm.lead | Opportunity | name: char*; partner: m2o; email: char; revenue: money; stage: sel; prob: num; user: sel; close: date; notes: text |
| ☐ | sale.order | Quotation | name: char; partner: m2o*; date: date; valid: date; term: m2o; user: sel; total: money; state: sel; inv: sel |
| ☐ | purchase.order | Request for Quotation | name: char; partner: m2o*; date: date; valid: date; term: m2o; user: sel; total: money; state: sel; inv: sel |
| ☐ | stock.picking | Transfer | name: char; partner: m2o; type: sel; date: date; src: char; state: sel |
| ☐ | stock.warehouse | Warehouse | name: char*; code: char*; city: char; recv: sel; ship: sel |
| ☐ | stock.location | Location | name: char*; kind: sel; wh: m2o |
| ☐ | stock.adjust | Inventory Adjustment | prod: m2o; counted: num; onhand: num; diff: num |
| ☐ | mrp.bom | Bill of Materials | prod: m2o*; qty: num; n: computed |
| ☐ | mrp.production | Manufacturing Order | name: char; prod: m2o*; qty: num; bom: m2o; date: date; state: sel |
| ☐ | hr.employee | Employee | name: char*; job: char; dept: sel; email: char; phone: char; mgr: sel; ctype: sel |
| ☐ | project.project | Project | name: char*; cust: m2o; pm: sel; tasks: computed; desc: text |
| ☐ | project.task | Task | name: char*; project: m2o*; user: sel; deadline: date; stage: sel; prio: sel; plan: num; spent: computed; desc: text |
| ☐ | account.analytic.line | Timesheet | date: date; emp: sel; project: m2o*; task: m2o; name: char*; hours: num |
| ☐ | hr.expense | Expense | name: char*; date: date; emp: sel; cat: sel; total: money; state: sel; move: char |
| ☐ | account.account | Account | code: char*; name: char*; type: sel*; reconcile: bool; deprecated: bool; tax: m2o; bal: computed |
| ☐ | account.journal | Journal | name: char*; type: sel*; code: char*; account: m2o; inAcc: m2o; outAcc: m2o; bank: char; dash: bool |
| ☐ | account.payment.term | Payment Term | name: char*; days: num; eom: bool; note: text |
| ☐ | account.tax | Tax | name: char*; type: sel; comp: sel; amount: num; incl: bool; label: char; grp: char; account: m2o; desc: text |
| ☐ | account.fiscal.position | Fiscal Position | name: char*; auto: bool; country: char |
| ☐ | res.currency | Currency | name: char*; sym: char; rate: num; active: bool |
| ☐ | account.analytic | Analytic Account | name: char*; plan: sel; balance: money |
| ☐ | account.reconcile.model | Reconciliation Model | name: char*; kind: sel; acc: m2o; label: char; amt: money |
| ☐ | account.move | Journal Entry | name: char; partner: m2o; invDate: date; term: m2o; due: date; date: date; journal: m2o*; ref: char; cur: sel; src: char; fpos: m2o; narration: text; state: sel; pay: sel; untaxed: money; total: money; residual: money |
| ☐ | account.payment | Payment | name: char; dir: sel; partner: m2o*; amount: money*; date: date; journal: m2o*; ref: char; state: sel; unalloc: money |
| ☐ | account.bank.statement.line | Transaction | date: date; journal: m2o*; label: char*; partner: m2o; amount: money*; state: sel |
| ☐ | account.asset | Asset | name: char*; date: date; value: money*; salvage: money; months: num; method: sel; aAcc: m2o; dAcc: m2o; eAcc: m2o; dep: computed; state: sel |
| ☐ | account.budget | Budget | name: char*; from: date; to: date; planned: computed; practical: computed; state: sel |
