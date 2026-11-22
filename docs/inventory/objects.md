# CRM objects (34)

Each object needs: list views, record page (sections), create/edit form, related lists, and its fields. Built once through the generic object framework, not per object.

|  | Object | Fields | List views | Kanban | Related lists | Seed rows in mock-up |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | Lead | 12 | 5 | yes | 0 | 42 |
| ☐ | Account | 12 | 4 |  | 3 | 30 |
| ☐ | Contact | 9 | 4 |  | 2 | 63 |
| ☐ | Opportunity | 11 | 6 | yes | 2 | 43 |
| ☐ | Case | 10 | 5 | yes | 0 | 34 |
| ☐ | Campaign | 12 | 3 |  | 0 | 7 |
| ☐ | Task | 7 | 5 |  | 0 | 12 |
| ☐ | Event | 8 | 2 |  | 0 | 8 |
| ☐ | Product | 5 | 2 |  | 0 | 6 |
| ☐ | Quote | 6 | 2 |  | 0 | 15 |
| ☐ | Contract | 6 | 2 |  | 0 | 10 |
| ☐ | Employee | 10 | 5 |  | 1 | 30 |
| ☐ | Job | 7 | 3 |  | 1 | 5 |
| ☐ | Candidate | 7 | 3 | yes | 0 | 20 |
| ☐ | TimeOff | 7 | 3 |  | 0 | 9 |
| ☐ | Article | 7 | 3 |  | 0 | 8 |
| ☐ | WorkOrder | 10 | 4 | yes | 0 | 18 |
| ☐ | ServiceAppointment | 7 | 2 |  | 0 | 20 |
| ☐ | ServiceResource | 5 | 2 |  | 0 | 6 |
| ☐ | Asset | 7 | 2 |  | 0 | 16 |
| ☐ | PriceBook | 5 | 2 |  | 0 | 4 |
| ☐ | DataStream | 7 | 2 |  | 0 | 8 |
| ☐ | Order | 9 | 2 |  | 0 | 5 |
| ☐ | PurchaseOrder | 9 | 2 |  | 0 | 4 |
| ☐ | Invoice | 13 | 2 |  | 0 | 22 |
| ☐ | Payment | 9 | 2 |  | 0 | 10 |
| ☐ | StockTransfer | 6 | 2 |  | 0 | 4 |
| ☐ | BillOfMaterials | 3 | 2 |  | 0 | 1 |
| ☐ | ManufacturingOrder | 6 | 2 |  | 0 | 2 |
| ☐ | Project | 5 | 2 |  | 0 | 3 |
| ☐ | ProjectTask | 9 | 2 |  | 0 | 8 |
| ☐ | Timesheet | 6 | 2 |  | 0 | 14 |
| ☐ | Expense | 7 | 2 |  | 0 | 5 |
| ☐ | StockItem | 10 | 2 |  | 0 | 12 |

## Lead (Leads)

- **Fields (12):** Name: text; Company: text; Title: text; Email: email; Phone: phone; Lead Source: select; Status: select; Rating: select; Industry: select; Lead Owner: select; Created Date: date; Description: textarea
- **List views:** Recently Viewed, All Open Leads, My Leads, Today’s Leads, Hot Leads
- **Related lists:** —
- **Record-page sections:** 3

## Account (Accounts)

- **Fields (12):** Name: text; Type: select; Industry: select; Phone: phone; Website: url; Annual Revenue: currency; Employees: number; Billing City: text; Billing Country: text; Rating: select; Account Owner: select; Description: textarea
- **List views:** Recently Viewed, All Accounts, My Accounts, New Last Week
- **Related lists:** ["Contact","Account"], ["Opportunity","Account"], ["Case","Account"]
- **Record-page sections:** 3

## Contact (Contacts)

- **Fields (9):** Name: text; Account: lookup; Title: text; Email: email; Phone: phone; Department: select; Mailing City: text; Contact Owner: select; Description: textarea
- **List views:** Recently Viewed, All Contacts, My Contacts, Birthdays This Month
- **Related lists:** ["Case","Contact"], ["Opportunity","Contact"]
- **Record-page sections:** 3

## Opportunity (Opportunities)

- **Fields (11):** Name: text; Account: lookup; Amount: currency; Close Date: date; Stage: select; Probability: pct; Type: select; Lead Source: select; Next Step: text; Opportunity Owner: select; Description: textarea
- **List views:** Recently Viewed, All Opportunities, My Opportunities, Closing This Month, Closing Next Month, Won
- **Related lists:** ["Quote","Opportunity"], ["Task","Related To"]
- **Record-page sections:** 3

## Case (Cases)

- **Fields (10):** Case Number: text; Subject: text; Account: lookup; Contact: lookup; Status: select; Priority: select; Origin: select; Type: select; Case Owner: select; Description: textarea
- **List views:** Recently Viewed, All Open Cases, My Cases, Escalated Cases, Closed Cases
- **Related lists:** —
- **Record-page sections:** 3

## Campaign (Campaigns)

- **Fields (12):** Name: text; Type: select; Status: select; Start Date: date; End Date: date; Budgeted Cost: currency; Actual Cost: currency; Expected Revenue: currency; Members: number; Responses: number; Campaign Owner: select; Description: textarea
- **List views:** Recently Viewed, All Active Campaigns, My Campaigns
- **Related lists:** —
- **Record-page sections:** 3

## Task (Tasks)

- **Fields (7):** Subject: text; Status: select; Priority: select; Due Date: date; Related To: text; Assigned To: select; Comments: textarea
- **List views:** Recently Viewed, My Tasks, Today, Overdue, Completed
- **Related lists:** —
- **Record-page sections:** 2

## Event (Events)

- **Fields (8):** Subject: text; Type: select; Start Date: date; Start Time: text; Location: text; Related To: text; Assigned To: select; Description: textarea
- **List views:** Recently Viewed, My Events
- **Related lists:** —
- **Record-page sections:** 2

## Product (Products)

- **Fields (5):** Name: text; Product Code: text; Family: select; List Price: currency; Active: bool
- **List views:** Recently Viewed, All Products
- **Related lists:** —
- **Record-page sections:** 1

## Quote (Quotes)

- **Fields (6):** Name: text; Opportunity: lookup; Status: select; Total: currency; Expiration Date: date; Quote Owner: select
- **List views:** Recently Viewed, All Quotes
- **Related lists:** —
- **Record-page sections:** 1

## Contract (Contracts)

- **Fields (6):** Contract Number: text; Account: lookup; Status: select; Start Date: date; Term (months): number; Contract Owner: select
- **List views:** Recently Viewed, All Contracts
- **Related lists:** —
- **Record-page sections:** 1

## Employee (Employees)

- **Fields (10):** Name: text; Employee ID: text; Department: select; Job Title: text; Manager: lookup; Location: text; Hire Date: date; Status: select; Email: email; Phone: phone
- **List views:** Recently Viewed, All Employees, Active Employees, New Hires (90 days), On Leave
- **Related lists:** ["TimeOff","Employee"]
- **Record-page sections:** 2

## Job (Job Openings)

- **Fields (7):** Title: text; Department: select; Location: text; Status: select; Hiring Manager: select; Openings: number; Posted Date: date
- **List views:** Recently Viewed, Open Positions, All Job Openings
- **Related lists:** ["Candidate","Job"]
- **Record-page sections:** 1

## Candidate (Candidates)

- **Fields (7):** Name: text; Job: lookup; Stage: select; Source: select; Email: email; Phone: phone; Rating: select
- **List views:** Recently Viewed, All Candidates, In Interview
- **Related lists:** —
- **Record-page sections:** 2

## TimeOff (Time Off Requests)

- **Fields (7):** Request: text; Employee: lookup; Type: select; Start Date: date; End Date: date; Days: number; Status: select
- **List views:** Recently Viewed, Pending Approval, All Requests
- **Related lists:** —
- **Record-page sections:** 1

## Article (Knowledge Articles)

- **Fields (7):** Title: text; Category: select; Status: select; Author: select; Views: number; Summary: textarea; Body: textarea
- **List views:** Recently Viewed, Published, Draft
- **Related lists:** —
- **Record-page sections:** 2

## WorkOrder (Work Orders)

- **Fields (10):** Name: text; Account: lookup; Subject: text; Status: select; Priority: select; Start Date: date; Duration (hrs): number; Service Territory: select; Work Order Owner: select; Description: textarea
- **List views:** Recently Viewed, All Work Orders, Open Work Orders, My Work Orders
- **Related lists:** —
- **Record-page sections:** 1

## ServiceAppointment (Service Appointments)

- **Fields (7):** Name: text; Work Order: lookup; Status: select; Scheduled Start: date; Scheduled Time: text; Assigned Resource: select; Address: text
- **List views:** Recently Viewed, All Service Appointments
- **Related lists:** —
- **Record-page sections:** 1

## ServiceResource (Service Resources)

- **Fields (5):** Name: text; Resource Type: select; Territory: select; Active: bool; Utilization %: pct
- **List views:** Recently Viewed, All Service Resources
- **Related lists:** —
- **Record-page sections:** 1

## Asset (Assets)

- **Fields (7):** Name: text; Account: lookup; Product: lookup; Serial Number: text; Install Date: date; Status: select; Price: currency
- **List views:** Recently Viewed, All Assets
- **Related lists:** —
- **Record-page sections:** 1

## PriceBook (Price Books)

- **Fields (5):** Name: text; Active: bool; Is Standard: bool; Entries: number; Description: textarea
- **List views:** Recently Viewed, All Price Books
- **Related lists:** —
- **Record-page sections:** 1

## DataStream (Data Streams)

- **Fields (7):** Name: text; Source: select; Category: select; Status: select; Records Ingested: number; Last Refresh: date; Refresh Mode: select
- **List views:** Recently Viewed, All Data Streams
- **Related lists:** —
- **Record-page sections:** 1

## Order (Sales Orders)

- **Fields (9):** Quotation: text; Customer: text; Order Date: date; Expiration: date; Payment Terms: text; Salesperson: select; Total: currency; Status: select; Invoice Status: select
- **List views:** Recently Viewed, All Sales Orders
- **Related lists:** —
- **Record-page sections:** 1

## PurchaseOrder (Purchase Orders)

- **Fields (9):** Reference: text; Vendor: text; Order Deadline: date; Expected Arrival: date; Payment Terms: text; Buyer: select; Total: currency; Status: select; Invoice Status: select
- **List views:** Recently Viewed, All Purchase Orders
- **Related lists:** —
- **Record-page sections:** 1

## Invoice (Invoices)

- **Fields (13):** Number: text; Payment Terms: text; Due Date: date; Accounting Date: date; Journal: text; Source Document: text; Fiscal Position: text; Terms and Conditions: textarea; Status: select; Payment Status: select; Tax Excluded: currency; Total: currency; Amount Due: currency
- **List views:** Recently Viewed, All Invoices
- **Related lists:** —
- **Record-page sections:** 1

## Payment (Payments)

- **Fields (9):** Number: text; Payment Type: select; Partner: text; Amount: currency; Date: date; Journal: text; Memo: text; Status: select; Unallocated: currency
- **List views:** Recently Viewed, All Payments
- **Related lists:** —
- **Record-page sections:** 1

## StockTransfer (Stock Transfers)

- **Fields (6):** Reference: text; Contact: text; Operation Type: select; Scheduled Date: date; Source Document: text; Status: select
- **List views:** Recently Viewed, All Stock Transfers
- **Related lists:** —
- **Record-page sections:** 1

## BillOfMaterials (Bills of Materials)

- **Fields (3):** Product: text; Quantity: number; Components: text
- **List views:** Recently Viewed, All Bills of Materials
- **Related lists:** —
- **Record-page sections:** 1

## ManufacturingOrder (Manufacturing Orders)

- **Fields (6):** Reference: text; Product: text; Quantity: number; Bill of Material: text; Scheduled Date: date; Status: select
- **List views:** Recently Viewed, All Manufacturing Orders
- **Related lists:** —
- **Record-page sections:** 1

## Project (Projects)

- **Fields (5):** Name: text; Customer: text; Project Manager: select; Tasks: text; Description: textarea
- **List views:** Recently Viewed, All Projects
- **Related lists:** —
- **Record-page sections:** 1

## ProjectTask (Project Tasks)

- **Fields (9):** Task Title: text; Project: text; Assignee: select; Deadline: date; Stage: select; Priority: select; Allocated Hours: number; Hours Spent: text; Description: textarea
- **List views:** Recently Viewed, All Project Tasks
- **Related lists:** —
- **Record-page sections:** 1

## Timesheet (Timesheet Entries)

- **Fields (6):** Date: date; Employee: select; Project: text; Task: text; Description: text; Hours Spent: number
- **List views:** Recently Viewed, All Timesheet Entries
- **Related lists:** —
- **Record-page sections:** 1

## Expense (Expenses)

- **Fields (7):** Description: text; Expense Date: date; Employee: select; Category: select; Total: currency; Status: select; Journal Entry: text
- **List views:** Recently Viewed, All Expenses
- **Related lists:** —
- **Record-page sections:** 1

## StockItem (Stock Items)

- **Fields (10):** Product Name: text; Internal Reference: text; Product Type: select; Product Category: select; Sales Price: currency; Cost: currency; On Hand: number; Customer Taxes: text; Vendor Taxes: text; Description: textarea
- **List views:** Recently Viewed, All Stock Items
- **Related lists:** —
- **Record-page sections:** 1
