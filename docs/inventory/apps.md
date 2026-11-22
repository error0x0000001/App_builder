# Apps, analytics and AI

## Main apps (7)

|  | App | Description | Navigation |
| --- | --- | --- | --- |
| ☐ | Sales | Manage your sales process with accounts, leads, opportunities and more. | Home · Leads · Accounts · Contacts · Opportunities · Forecasts · Calendar · Tasks · Reports · Dashboards |
| ☐ | Service | Resolve cases faster with the console and knowledge. | Home · Service Console · Cases · Knowledge · Accounts · Contacts · Reports · Dashboards |
| ☐ | Marketing | Plan campaigns, build journeys and send email. | Home · Campaigns · Leads · Contacts · Journeys · Segments · Email Studio · Reports · Dashboards |
| ☐ | HR | Employees, recruiting, time off and the org chart. | Home · Employees · Recruiting · Job Openings · Time Off · Org Chart · Reports |
| ☐ | Analytics Studio | Dashboards, reports and datasets. | Home · Dashboards · Reports |
| ☐ | Agentforce Studio | Build agents, prompt templates and models. | Home · Agents · Prompt Builder · Models · Testing Center |
| ☐ | Setup | Configure and customize your org. | Home · Object Manager |

## Additional apps (7)

|  | App | Description | Navigation |
| --- | --- | --- | --- |
| ☐ | Commerce | Run your online store: orders, products, storefronts and promotions. | Home · Orders · Products · Price Books · Accounts · Storefronts · Promotions · Reports · Dashboards |
| ☐ | Field Service | Schedule and dispatch technicians for on-site work. | Home · Work Orders · Service Appointments · Dispatcher Console · Service Resources · Parts & Stock · Accounts · Reports |
| ☐ | Revenue Cloud | Quote, price, contract and bill with guided selling. | Home · Opportunities · Quotes · Contracts · Invoices · Orders · Price Books · Reports |
| ☐ | Data Cloud | Unify customer data and activate it across channels. | Home · Data Streams · Data Explorer · Identity Resolution · Calculated Insights · Segments · Reports |
| ☐ | Digital Experiences | Build branded sites for customers and partners. | All Sites · Site Builder · Members · Reports |
| ☐ | Slack | Chat with your team and swarm on records in channels. | Home · Channels · Huddles |
| ☐ | Tableau Next | Explore data with interactive visualizations. | Home · Workbooks · Data Sources · Dashboards |

## Special pages (34)

Bespoke screens that are not plain object lists:

- ☐ `agent`
- ☐ `agents`
- ☐ `ai-home`
- ☐ `analytics-home`
- ☐ `commerce-home`
- ☐ `console`
- ☐ `datacloud-home`
- ☐ `dispatch`
- ☐ `emails`
- ☐ `explorer`
- ☐ `field-home`
- ☐ `hr-home`
- ☐ `identity`
- ☐ `insights`
- ☐ `journey`
- ☐ `journeys`
- ☐ `knowledge`
- ☐ `marketing-home`
- ☐ `models`
- ☐ `orgchart`
- ☐ `promotions`
- ☐ `prompt`
- ☐ `prompts`
- ☐ `revenue-home`
- ☐ `segments`
- ☐ `service-home`
- ☐ `site-builder`
- ☐ `site-members`
- ☐ `sites`
- ☐ `slack`
- ☐ `studio`
- ☐ `tableau-home`
- ☐ `tableau-viz`
- ☐ `testing`

## Reports (11)

|  | Report | Object | Grouped by | Summary | Folder | Columns |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | Open Pipeline by Stage | Opportunity | Stage | sum of Amount | Sales Reports | Name, Account, Amount, Close Date, Opportunity Owner |
| ☐ | Closed Won by Owner | Opportunity | Opportunity Owner | sum of Amount | Sales Reports | Name, Account, Amount, Close Date |
| ☐ | Leads by Source | Lead | Lead Source | count | Marketing Reports | Name, Company, Status, Lead Owner |
| ☐ | Cases by Priority | Case | Priority | count | Service Reports | Case Number, Subject, Status, Account |
| ☐ | Accounts by Industry | Account | Industry | count | Sales Reports | Name, Type, Billing City, Annual Revenue |
| ☐ | Campaign Expected Revenue by Type | Campaign | Type | sum of Expected Revenue | Marketing Reports | Name, Status, Budgeted Cost, Expected Revenue |
| ☐ | Headcount by Department | Employee | Department | count | HR Reports | Name, Job Title, Location, Status |
| ☐ | Time Off Days by Type | TimeOff | Type | sum of Days | HR Reports | Request, Employee, Start Date, Days, Status |
| ☐ | Candidates by Stage | Candidate | Stage | count | HR Reports | Name, Job, Source, Rating |
| ☐ | Pipeline by Lead Source | Opportunity | Lead Source | sum of Amount | Sales Reports | Name, Account, Amount, Stage |
| ☐ | Cases by Owner | Case | Case Owner | count | Service Reports | Case Number, Subject, Priority, Status |

## Dashboards (5)

|  | Dashboard | Folder | Components |
| --- | --- | --- | --- |
| ☐ | Sales Pipeline Overview | Sales | metric:Open Pipeline; metric:Closed Won; gauge:Quota Attainment; bar:Pipeline by Stage; donut:Pipeline by Source; hbar:Closed Won by Owner; funnel:Lead Funnel |
| ☐ | Service Operations | Service | metric:Total Cases; donut:Cases by Priority; hbar:Cases by Owner |
| ☐ | Marketing Performance | Marketing | bar:Expected Revenue by Campaign Type; donut:Leads by Source; line:Leads per Month |
| ☐ | HR Headcount & Hiring | HR | metric:Employees; bar:Headcount by Department; funnel:Hiring Funnel; donut:Time Off Days by Type |
| ☐ | Executive Summary | Executive | gauge:Quota Attainment; line:Bookings Trend; donut:Accounts by Industry; metric:Open Pipeline |

## AI agents (4)

|  | Agent | Purpose | Status | Topics → actions |
| --- | --- | --- | --- | --- |
| ☐ | Service Agent | Answers customer questions and resolves cases | Active | Order Status → Look Up Order, Send Tracking Email; Refunds → Create Refund Case, Escalate to Human; Password Reset → Send Reset Link |
| ☐ | Sales Coach | Suggests next best actions for reps | Active | Deal Coaching → Summarize Opportunity, Draft Follow-up Email |
| ☐ | Setup Agent | Helps admins navigate and configure Setup | Inactive | Navigation → Open Setup Page; User Access → Compare Permissions |
| ☐ | HR Helper | Answers employee policy questions | Draft | Time Off → Create Time Off Request |