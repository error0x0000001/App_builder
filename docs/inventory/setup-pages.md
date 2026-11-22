# Setup / Administration pages (266)

Generated from the mock-up. Tick a row when the page is built **and** passes its acceptance check (see README).

Kinds: Dashboard page ×8 · List ×140 · Hierarchy tree ×1 · Settings form ×83 · Info / call-to-action page ×25 · Object Manager (builder) ×1 · Schema Builder (builder) ×1 · Themes & Branding (builder) ×1 · Debug-log viewer ×1 · System overview ×1 · Detail page ×2 · Health check ×1 · Sharing settings ×1

**What kind of work each page is** (derived from the mock-up definitions):

- Config records (create/edit): **89**
- Settings (stored flags/fields): **83**
- Read-only view / monitor: **51**
- Tool / one-shot action: **25**
- Bespoke builder / viewer: **10**
- Monitoring dashboard: **8**

“Engine?” = the page’s settings/records only take effect when a behaviour engine reads them (name heuristic; review per page): **63** pages.

## ADMINISTRATION › Users (19)

|  | Page | Sub-section | Kind | Class | Engine? | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | Adoption Manager |  | Dashboard page | Monitoring dashboard |  | Monitor how your users adopt features across the org. |
| ☐ | Assigned Apps | Permission Sets | List | Read-only view / monitor |  | 2 columns: Permission Set, App |
| ☐ | Assigned Connected Apps | Permission Sets | List | Read-only view / monitor |  | 2 columns: Permission Set, Connected App |
| ☐ | Object Settings | Permission Sets | List | Read-only view / monitor |  | 6 columns: Object, Permission Set, Read, Create, Edit, Delete |
| ☐ | App Permissions | Permission Sets | List | Read-only view / monitor |  | 3 columns: Permission, Enabled, Permission Set |
| ☐ | Apex Class Permissions | Permission Sets | List | Read-only view / monitor |  | 2 columns: Apex Class, Permission Set |
| ☐ | VF Page Access | Permission Sets | List | Read-only view / monitor |  | 2 columns: Visualforce Page, Permission Set |
| ☐ | External Data Source Access | Permission Sets | List | Read-only view / monitor |  | 2 columns: Data Source, Permission Set |
| ☐ | Named Credential Access | Permission Sets | List | Read-only view / monitor |  | 2 columns: Named Credential, Permission Set |
| ☐ | Custom Permissions | Permission Sets | List | Config records (create/edit) |  | 5 columns: Label, Name, Description, Connected App, Last Modified · action “New” |
| ☐ | System Permissions | Permission Sets | List | Read-only view / monitor |  | 3 columns: Permission, Enabled, Permission Set |
| ☐ | Manage Assignments | Permission Sets | List | Config records (create/edit) | yes | 3 columns: User, Permission Set, Assigned · action “Add Assignments” |
| ☐ | Permission Set Groups |  | List | Config records (create/edit) |  | 5 columns: Label, API Name, Status, Description, Last Modified · action “New Permission Set Group” |
| ☐ | Profiles |  | List | Config records (create/edit) |  | 6 columns: Profile Name, User License, Custom, Description, Created By, Last Modified · action “New Profile” |
| ☐ | Public Groups |  | List | Config records (create/edit) |  | 3 columns: Label, Group Name, Created By · action “New” |
| ☐ | Queues |  | List | Config records (create/edit) |  | 5 columns: Label, Queue Name, Email, Supported Objects, Created By · action “New” |
| ☐ | Roles |  | Hierarchy tree | Bespoke builder / viewer |  | Roles — Role hierarchy. Users in a role can see data owned by users below them. |
| ☐ | User Management Settings |  | Settings form | Settings (stored flags/fields) |  | 6 fields in 1 section(s): Enhanced Profile List Views (bool), Enhanced Profile User Interface (bool), User Permissions Management (bool), Field-level security for permission sets during field creation (bool), Enable user permission usage-based management (bool), Enable User Access Policies (bool) |
| ☐ | Users |  | List | Config records (create/edit) |  | 7 columns: Full Name, Alias, Username, Email, Role, Active, Profile · views: All Users, Active Users, Admin Users, Inactive Users, … (+1) · action “New User” |

## ADMINISTRATION › Data (21)

|  | Page | Sub-section | Kind | Class | Engine? | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | Big Objects |  | List | Config records (create/edit) |  | 5 columns: Label, Object Name, Description, Deployment Status, Last Modified · action “New Big Object” |
| ☐ | Data Export |  | Settings form | Settings (stored flags/fields) | yes | 6 fields in 1 section(s): Schedule (text), Next export scheduled (text), Last export (text), Include images, documents and attachments (bool), Include Chatter files and Salesforce CRM Content document versions (bool), Replace carriage returns with spaces (bool) |
| ☐ | Data Import Wizard |  | Info / call-to-action page | Tool / one-shot action | yes | Data Import Wizard — Import up to 50,000 records at a time for standard objects (accounts, contacts, leads, solutions, campaign members) and custom objects. — CTA “Launch Wizard” |
| ☐ | Data Integration Metrics |  | Dashboard page | Monitoring dashboard |  | Review match and duplicate metrics for data integration rules. |
| ☐ | Data Integration Rules |  | List | Read-only view / monitor | yes | 4 columns: Rule, Object, Status, Last Run |
| ☐ | Data Loader |  | Info / call-to-action page | Tool / one-shot action | yes | Data Loader — Data Loader is a client application for the bulk import or export of data. Use it to insert, update, delete, or export records. — CTA “Download Data Loader” |
| ☐ | Duplicate Error Logs | Duplicate Management | List | Read-only view / monitor | yes | 5 columns: Record, Object, Rule, Action, Date |
| ☐ | Duplicate Rules | Duplicate Management | List | Config records (create/edit) | yes | 5 columns: Rule Name, Object, Matching Rule, Status, Last Modified · action “New Rule” |
| ☐ | Matching Rules | Duplicate Management | List | Config records (create/edit) | yes | 5 columns: Rule Name, Object, Description, Status, Last Modified · action “New Rule” |
| ☐ | External Data Sources |  | List | Config records (create/edit) |  | 5 columns: Label, Name, Type, Identity Type, Last Modified · action “New External Data Source” |
| ☐ | External Objects |  | List | Config records (create/edit) |  | 4 columns: Label, API Name, External Data Source, Last Modified · action “New External Object” |
| ☐ | Mass Delete Records |  | Info / call-to-action page | Tool / one-shot action | yes | Mass Delete Records — Select a record type to permanently remove or move to the Recycle Bin. This action cannot be undone for permanent deletions. — CTA “Select Record Type” |
| ☐ | Mass Transfer Approval Requests |  | Info / call-to-action page | Tool / one-shot action | yes | Mass Transfer Approval Requests — Reassign approval requests from one approver to another. — CTA “Search Approval Requests” |
| ☐ | Mass Transfer Records |  | Info / call-to-action page | Tool / one-shot action | yes | Mass Transfer Records — Transfer ownership of accounts, leads, service contracts, and custom objects from one user to another. — CTA “Start Transfer” |
| ☐ | Mass Update Addresses |  | Info / call-to-action page | Tool / one-shot action | yes | Mass Update Addresses — Update country, state and territory values across records in bulk. — CTA “Start” |
| ☐ | Picklist Settings |  | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Allow users to create new values on the fly in unrestricted picklists (bool), Display unrestricted picklist values in reports (bool) |
| ☐ | Platform Events |  | List | Config records (create/edit) | yes | 6 columns: Label, Plural Label, API Name, Deployment Status, Description, Last Modified · action “New Platform Event” |
| ☐ | Schema Settings |  | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Enable Custom Object Setting Type for Custom Settings (bool), Let Schema Builder Edit Objects (bool), Allow Salesforce to Provide Object Suggestions (bool) |
| ☐ | Secure Agents | Secure Agent Cluster | List | Read-only view / monitor |  | 4 columns: Agent, Version, Status, Last Heartbeat |
| ☐ | State and Country/Territory Picklists |  | List | Read-only view / monitor | yes | 5 columns: Country, ISO Code, Visible, Integration Value, States / Territories |
| ☐ | Storage Usage |  | Dashboard page | Monitoring dashboard |  | Data and file storage used by your organization. |

## ADMINISTRATION › Email (18)

|  | Page | Sub-section | Kind | Class | Engine? | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | Apex Exception Email |  | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Users (text), Additional emails (text) |
| ☐ | Compliance BCC Email |  | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Enable Compliance BCC Email (bool), BCC email address (text), Include Salesforce emails sent as system (bool) |
| ☐ | DKIM Keys |  | List | Config records (create/edit) |  | 5 columns: Selector, Domain, Alternate Selector, Status, Created · action “Create New Key” |
| ☐ | Deliverability |  | Settings form | Settings (stored flags/fields) | yes | 3 fields in 2 section(s): Access level (select), Enable compliance with standard email security mechanisms (bool), Enable SPF/DKIM rewriting (bool) |
| ☐ | Email Attachments |  | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Attachment size limit (select), Allow forwarding of attachments (bool) |
| ☐ | Email Footers |  | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Append footer to outbound mass email (bool), Footer text (text) |
| ☐ | Email Relay Activation |  | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Enable email relay (bool), Host (text), Port (text) |
| ☐ | Email Templates |  | List | Config records (create/edit) |  | 5 columns: Email Template Name, Folder, Template Type, Related Entity, Last Modified · views: All Email Templates, Recently Viewed · action “New Email Template” |
| ☐ | Email to Salesforce |  | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Active (bool), Email address (text), Unresolved email handling (select) |
| ☐ | Enhanced Email |  | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Enable Enhanced Email (bool), Allow users to send from the Activity composer (bool) |
| ☐ | Letterheads |  | List | Config records (create/edit) |  | 4 columns: Letterhead, Available For Use, Description, Last Modified · action “New Letterhead” |
| ☐ | Lightning for Gmail and Sync |  | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Enable Lightning for Gmail (bool), Enable Einstein Activity Capture (bool) |
| ☐ | Lightning for Outlook |  | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Enable Lightning for Outlook (bool), Let users see activity timeline in Outlook (bool) |
| ☐ | Mail Merge Templates |  | List | Config records (create/edit) |  | 3 columns: Template Name, File Name, Last Modified · action “New Template” |
| ☐ | Organization-Wide Addresses |  | List | Config records (create/edit) |  | 4 columns: Display Name, Email Address, Allow All Profiles, Verification Status · action “Add” |
| ☐ | Outlook Configurations |  | List | Config records (create/edit) |  | 3 columns: Configuration, Description, Status · action “New” |
| ☐ | Send Through External Email Services |  | Settings form | Settings (stored flags/fields) |  | 1 fields in 1 section(s): Allow users to send email through external services (bool) |
| ☐ | Test Deliverability |  | Info / call-to-action page | Tool / one-shot action | yes | Test Deliverability — Send a test email to confirm that your org can reach the destination address. — CTA “Send Test Email” |

## PLATFORM TOOLS › Apps (12)

|  | Page | Sub-section | Kind | Class | Engine? | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | App Manager |  | List | Config records (create/edit) |  | 6 columns: App Name, Developer Name, Description, Last Modified, App Type, Navigation Style · action “New Lightning App” |
| ☐ | AppExchange Marketplace |  | Info / call-to-action page | Tool / one-shot action |  | AppExchange Marketplace — Browse thousands of apps, components, and consultants built for your business. — CTA “Visit AppExchange” |
| ☐ | Connected Apps OAuth Usage | Connected Apps | List | Read-only view / monitor |  | 4 columns: Connected App, Users, Use Count, Last Used |
| ☐ | Manage Connected Apps | Connected Apps | List | Config records (create/edit) |  | 6 columns: Name, Version, Publisher, Start URL, Created By, Created Date · action “New Connected App” |
| ☐ | Installed Packages |  | List | Read-only view / monitor |  | 9 columns: Package Name, Publisher, Version Number, Status, Namespace Prefix, Apps, Components, Limits, … (+1) |
| ☐ | Branding | Mobile Apps | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Brand color (text), Logo (text), Login splash (text) |
| ☐ | Mobile Quick Start | Mobile Apps | Info / call-to-action page | Tool / one-shot action |  | Mobile Quick Start — Roll out the mobile app to your users in a few simple steps. — CTA “Get Started” |
| ☐ | Navigation | Mobile Apps | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Navigation menu (select), Show recent items (bool) |
| ☐ | Notifications | Mobile Apps | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Enable push notifications (bool), Allow SMS notifications (bool) |
| ☐ | Offline | Mobile Apps | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Enable offline access (bool), Briefcase size limit (text) |
| ☐ | Mobile Settings | Mobile Apps | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Enable the mobile app (bool), Enable Biometric (bool), Enable ADA compliance mode (bool) |
| ☐ | Package Manager |  | List | Config records (create/edit) |  | 5 columns: Package, Type, Version, Namespace, Last Modified · action “New” |

## PLATFORM TOOLS › Feature Settings (83)

|  | Page | Sub-section | Kind | Class | Engine? | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | Reports and Dashboards | Analytics | Settings form | Settings (stored flags/fields) |  | 5 fields in 2 section(s): Enable Folder Sharing (bool), Enable Enhanced Filters (bool), Enable Report Export Notifications (bool), Enable Report Builder Summary Fields (bool), Enable Lightning Report Builder (bool) |
| ☐ | Access Policies | Analytics | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Allow Salesforce Users to see Public Reports (bool), Require approval for external sharing (bool) |
| ☐ | Historical Trending | Analytics | List | Read-only view / monitor |  | 4 columns: Object, Fields Tracked, Status, Last Modified |
| ☐ | Custom Report Types | Analytics | List | Config records (create/edit) |  | 5 columns: Report Type Label, Primary Object, Category, Deployment Status, Last Modified · action “New Custom Report Type” |
| ☐ | Reporting Snapshots | Analytics | List | Config records (create/edit) | yes | 6 columns: Name, Source Report, Target Object, Run As, Status, Last Run · action “New Reporting Snapshot” |
| ☐ | Reports and Dashboards Settings | Analytics | Settings form | Settings (stored flags/fields) |  | 5 fields in 2 section(s): Enable Folder Sharing (bool), Enable Enhanced Filters (bool), Enable Report Export Notifications (bool), Enable Report Builder Summary Fields (bool), Enable Lightning Report Builder (bool) |
| ☐ | Chatter Settings | Chatter | Settings form | Settings (stored flags/fields) |  | 6 fields in 2 section(s): Enable Feed Tracking (bool), Enable Chatter Messenger (bool), Allow Chatter Stream (bool), Enable Chatter Rich Publisher (bool), Allow email replies (bool), Digest frequency (select) |
| ☐ | Chatter Email Settings | Chatter | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Allow Email Notifications (bool), Default frequency (select) |
| ☐ | Feed Items | Chatter | List | Read-only view / monitor |  | 3 columns: Object, Enable Feed Tracking, Fields Tracked |
| ☐ | Feed Item Actions | Chatter | List | Read-only view / monitor |  | 3 columns: Action, Type, Status |
| ☐ | Feed Item Layouts | Chatter | List | Read-only view / monitor |  | 2 columns: Layout, Type |
| ☐ | Feed Tracking | Chatter | List | Read-only view / monitor |  | 3 columns: Object, Enable Feed Tracking, Fields Tracked |
| ☐ | Groups | Chatter | List | Config records (create/edit) |  | 4 columns: Group Name, Access Type, Members, Owner · action “New Group” |
| ☐ | Group Layouts | Chatter | List | Read-only view / monitor |  | 3 columns: Layout, Assigned, Last Modified |
| ☐ | Influence | Chatter | Settings form | Settings (stored flags/fields) |  | 1 fields in 1 section(s): Enable Influence tracking (bool) |
| ☐ | Feed Comment Triggers | Chatter | List | Read-only view / monitor | yes | 3 columns: Trigger, Status, Last Modified |
| ☐ | FeedItem Triggers | Chatter | List | Read-only view / monitor | yes | 3 columns: Trigger, Status, Last Modified |
| ☐ | Cisco Spark and WebEx |  | Settings form | Settings (stored flags/fields) |  | 1 fields in 1 section(s): Enable WebEx integration (bool) |
| ☐ | Digital Experiences Settings | Digital Experiences | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Enable Digital Experiences (bool), Domain name (text), Enable ExperienceBundle Metadata API (bool) |
| ☐ | All Sites | Digital Experiences | List | Config records (create/edit) |  | 5 columns: Name, URL, Template, Status, Last Modified · action “New Site” |
| ☐ | Field Mapping | Data.com | List | Read-only view / monitor |  | 2 columns: Field, Source |
| ☐ | Data.com Licenses and Limits | Data.com | Dashboard page | Monitoring dashboard |  |  |
| ☐ | Prospector Preferences | Data.com | Settings form | Settings (stored flags/fields) |  | 1 fields in 1 section(s): Enable Prospector (bool) |
| ☐ | All Data.com Users | Data.com | List | Read-only view / monitor |  | 2 columns: Name, Licence |
| ☐ | Home |  | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Show Quip documents on Home (bool), Enable Home page Assistant (bool), Default Home Page (text) |
| ☐ | Campaign Influence | Marketing | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Enable Campaign Influence (bool), Model (select) |
| ☐ | Lead Assignment Rules | Marketing | List | Config records (create/edit) | yes | 4 columns: Rule Name, Active, Created By, Last Modified · action “New” |
| ☐ | Lead Auto-Response Rules | Marketing | List | Config records (create/edit) | yes | 4 columns: Rule Name, Active, Created By, Last Modified · action “New” |
| ☐ | Lead Processes | Marketing | List | Config records (create/edit) | yes | 4 columns: Name, Status, Description, Last Modified · action “New” |
| ☐ | Lead Settings | Marketing | Settings form | Settings (stored flags/fields) |  | 6 fields in 1 section(s): Default Lead Creator (select), Enable Lead Conversion for Person Accounts (bool), Notify Lead Owner of Conversion (bool), Allow lead status field to display in conversion (bool), Require Validation for Converted Leads (bool), Enable Merge and Delete Duplicate Leads (bool) |
| ☐ | LinkedIn Lead Gen | Marketing | Info / call-to-action page | Tool / one-shot action |  | LinkedIn Lead Gen — Connect LinkedIn lead gen forms to create leads automatically. — CTA “Connect” |
| ☐ | Web-to-Lead | Marketing | Settings form | Settings (stored flags/fields) | yes | 4 fields in 1 section(s): Web-to-Lead Enabled (bool), Default Lead Creator (text), Default Response Template (text), Include reCAPTCHA in HTML (bool) |
| ☐ | Office 365 |  | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Enable Office 365 (bool), Use Office Online (bool) |
| ☐ | Skype for Salesforce |  | Settings form | Settings (stored flags/fields) |  | 1 fields in 1 section(s): Enable Skype (bool) |
| ☐ | Quip Setup |  | Settings form | Settings (stored flags/fields) |  | 1 fields in 1 section(s): Enable Quip (bool) |
| ☐ | Account Settings | Sales | Settings form | Settings (stored flags/fields) |  | 5 fields in 1 section(s): Enable Account Teams (bool), Enable Social Accounts and Contacts (bool), Enable Contacts to Multiple Accounts (bool), Show View Hierarchy link on account pages (bool), Enable Account Insights (bool) |
| ☐ | Account Teams | Sales | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Enable Account Teams (bool), Default account team on user detail (bool) |
| ☐ | Activity Settings | Sales | Settings form | Settings (stored flags/fields) |  | 4 fields in 1 section(s): Allow Users to Relate Multiple Contacts to Tasks and Events (bool), Enable Group Events (bool), Enable Recurring Events (bool), Enable Task Notifications (bool) |
| ☐ | Contact Roles on Contracts | Sales | List | Config records (create/edit) |  | 2 columns: Role, Position · action “New” |
| ☐ | Contact Roles on Opportunities | Sales | List | Config records (create/edit) |  | 2 columns: Role, Position · action “New” |
| ☐ | Contract Settings | Sales | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Activated Contracts Can be Edited (bool), Notify Owner about expiring contracts (bool), Expiration notice (days) (text) |
| ☐ | Forecasts Settings | Sales | Settings form | Settings (stored flags/fields) | yes | 4 fields in 1 section(s): Enable Forecasts (bool), Forecast Period (select), Enable Quotas (bool), Show quota attainment (bool) |
| ☐ | Notes Settings | Sales | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Enable Notes (bool), Users can delete notes (bool) |
| ☐ | Opportunity Settings | Sales | Settings form | Settings (stored flags/fields) |  | 6 fields in 1 section(s): Enable Update Reminders (bool), Enable Opportunity Teams (bool), Enable Big Deal Alerts (bool), Big deal amount (text), Require Close Date in the Future (bool), Enable Similar Opportunities (bool) |
| ☐ | Opportunity Team Settings | Sales | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Enable Team Selling (bool), Default Opportunity Team (bool) |
| ☐ | Order Settings | Sales | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Enable Orders (bool), Enable Negative Quantities (bool), Enable Reduction Orders (bool) |
| ☐ | Product Settings | Sales | Settings form | Settings (stored flags/fields) |  | 4 fields in 1 section(s): Enable Product Schedules (bool), Enable Quantity Schedules (bool), Enable Revenue Schedules (bool), Enable Product Families (bool) |
| ☐ | Quote Settings | Sales | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Enable Quotes (bool), Enable Quote PDF Templates (bool) |
| ☐ | Sales Processes | Sales | List | Config records (create/edit) | yes | 4 columns: Name, Description, Status, Last Modified · action “New” |
| ☐ | Sales Methodologies | Sales | List | Config records (create/edit) |  | 3 columns: Name, Stages, Status · action “New” |
| ☐ | Social Accounts, Contacts, and Leads Settings | Sales | Settings form | Settings (stored flags/fields) |  | 1 fields in 1 section(s): Enable Social Accounts, Contacts, and Leads (bool) |
| ☐ | Territory Settings | Sales | Settings form | Settings (stored flags/fields) | yes | 2 fields in 1 section(s): Enable Enterprise Territory Management (bool), Allow forecasts by territory (bool) |
| ☐ | Update Reminders | Sales | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Enable Update Reminders (bool), Days before close (text) |
| ☐ | Asset Files | Files | List | Config records (create/edit) |  | 5 columns: Name, Type, Size, Created, Owner · action “Upload” |
| ☐ | Content Deliveries and Public Links | Files | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Enable content deliveries (bool), Allow public links for files (bool) |
| ☐ | Files Connect Settings | Files | Settings form | Settings (stored flags/fields) |  | 1 fields in 1 section(s): Enable Files Connect (bool) |
| ☐ | Files Settings | Files | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Enable Files Sync (bool), Enable Files Preview (bool), Max file size (select) |
| ☐ | Regenerate a Content or File Preview | Files | Info / call-to-action page | Tool / one-shot action |  | Regenerate Preview — Regenerate the preview of a file or content version. — CTA “Search Files” |
| ☐ | CRM Content | Files | Settings form | Settings (stored flags/fields) |  | 1 fields in 1 section(s): Enable Salesforce CRM Content (bool) |
| ☐ | IoT Get Started |  | Info / call-to-action page | Tool / one-shot action |  | IoT — Connect devices and react to events in real time. — CTA “Get Started” |
| ☐ | Promoted Search Terms | Search | List | Config records (create/edit) |  | 4 columns: Search Term, Promoted Record, Last Modified, Created By · action “New Promoted Term” |
| ☐ | Synonyms | Search | List | Config records (create/edit) |  | 3 columns: Group, Terms, Last Modified · action “New Synonym Group” |
| ☐ | Search Settings | Search | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Enable Enhanced Lookup (bool), Enable Einstein Search (bool), Enable Search Personalization (bool) |
| ☐ | Call Centers | Service | List | Config records (create/edit) |  | 3 columns: Call Center Name, Adapter, Internal Name · action “Import” |
| ☐ | Directory Numbers | Service | List | Config records (create/edit) |  | 2 columns: Number, Label · action “New” |
| ☐ | Softphone Layouts | Service | List | Config records (create/edit) |  | 2 columns: Layout, Assigned · action “New” |
| ☐ | Case Assignment Rules | Service | List | Config records (create/edit) | yes | 3 columns: Rule Name, Active, Last Modified · action “New” |
| ☐ | Case Auto-Response Rules | Service | List | Config records (create/edit) | yes | 3 columns: Rule Name, Active, Last Modified · action “New” |
| ☐ | Case Comment Triggers | Service | List | Read-only view / monitor | yes | 2 columns: Trigger, Status |
| ☐ | Email-to-Case | Service | Settings form | Settings (stored flags/fields) | yes | 4 fields in 1 section(s): Enable Email-to-Case (bool), Enable On-Demand Email-to-Case (bool), Routing address (text), Case origin (select) |
| ☐ | Entitlement Settings | Service | Settings form | Settings (stored flags/fields) | yes | 3 fields in 1 section(s): Enable Entitlement Management (bool), Enable Milestones (bool), Enable Entitlement Versioning (bool) |
| ☐ | Escalation Rules | Service | List | Config records (create/edit) | yes | 3 columns: Rule Name, Active, Last Modified · action “New” |
| ☐ | Feed Filters | Service | List | Config records (create/edit) |  | 2 columns: Filter, Object · action “New” |
| ☐ | Field Service Settings | Service | Settings form | Settings (stored flags/fields) |  | 1 fields in 1 section(s): Enable Field Service (bool) |
| ☐ | Macro Settings | Service | Settings form | Settings (stored flags/fields) | yes | 2 fields in 1 section(s): Enable Macros (bool), Enable Macros in Utility Bar (bool) |
| ☐ | Snap-ins | Service | Info / call-to-action page | Tool / one-shot action |  | Snap-ins — Add chat and other service features to your website or mobile app. — CTA “Get Started” |
| ☐ | Support Processes | Service | List | Config records (create/edit) | yes | 3 columns: Name, Status, Description · action “New” |
| ☐ | Support Settings | Service | Settings form | Settings (stored flags/fields) |  | 5 fields in 1 section(s): Case Auto-Response (text), Notify Case Owner (bool), Show Customer Portal on Case (bool), Enable Case Feed (bool), Enable Social Customer Service (bool) |
| ☐ | Web-to-Case | Service | Settings form | Settings (stored flags/fields) | yes | 3 fields in 1 section(s): Enable Web-to-Case (bool), Default Case Origin (text), Default Response Template (text) |
| ☐ | Web-to-Case HTML Generator | Service | Info / call-to-action page | Tool / one-shot action | yes | Web-to-Case HTML Generator — Generate HTML to embed a case form on your website. — CTA “Generate” |
| ☐ | Survey Settings |  | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Enable Surveys (bool), Allow guest users to respond (bool) |
| ☐ | Topics Assignment Triggers | Topics | List | Read-only view / monitor | yes | 2 columns: Trigger, Status |
| ☐ | Topics Triggers | Topics | List | Read-only view / monitor | yes | 2 columns: Trigger, Status |

## PLATFORM TOOLS › Einstein (3)

|  | Page | Sub-section | Kind | Class | Engine? | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | Einstein Platform |  | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Turn on Einstein (bool), Enable Einstein Prediction Builder (bool), Enable Einstein Discovery (bool) |
| ☐ | Einstein Sales |  | Settings form | Settings (stored flags/fields) |  | 4 fields in 1 section(s): Einstein Lead Scoring (bool), Einstein Opportunity Scoring (bool), Einstein Activity Capture (bool), Pipeline Inspection (bool) |
| ☐ | Readiness Assessor |  | Dashboard page | Monitoring dashboard |  | Assess data readiness for Einstein features. |

## PLATFORM TOOLS › Objects and Fields (3)

|  | Page | Sub-section | Kind | Class | Engine? | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | Object Manager |  | Object Manager (builder) | Bespoke builder / viewer |  |  |
| ☐ | Picklist Value Sets |  | List | Config records (create/edit) |  | 4 columns: Label, API Name, Description, Last Modified · action “New” |
| ☐ | Schema Builder |  | Schema Builder (builder) | Bespoke builder / viewer |  |  |

## PLATFORM TOOLS › Process Automation (11)

|  | Page | Sub-section | Kind | Class | Engine? | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | Approval Processes |  | List | Config records (create/edit) | yes | 5 columns: Process Name, Object, Status, Entry Criteria, Last Modified · action “Create New Approval Process” |
| ☐ | Flows |  | List | Config records (create/edit) | yes | 7 columns: Flow Label, Flow API Name, Type, Process Type, Status, Last Modified, Version · views: All Flows, Recently Viewed Flows · action “New Flow” |
| ☐ | Post Templates |  | List | Config records (create/edit) |  | 3 columns: Label, Type, Last Modified · action “New” |
| ☐ | Process Automation Settings |  | Settings form | Settings (stored flags/fields) | yes | 4 fields in 1 section(s): Default Workflow User (text), Let Flows run as default workflow user (bool), Enable Process Builder Notifications (bool), Error email recipients (text) |
| ☐ | Process Builder |  | List | Config records (create/edit) | yes | 5 columns: Process Name, Object, Status, Last Modified, Versions · action “New Process” |
| ☐ | Email Alerts | Workflow Actions | List | Config records (create/edit) |  | 4 columns: Description, Unique Name, Object, Email Template · action “New Email Alert” |
| ☐ | Field Updates | Workflow Actions | List | Config records (create/edit) |  | 4 columns: Name, Unique Name, Object, Field to Update · action “New Field Update” |
| ☐ | Outbound Messages | Workflow Actions | List | Config records (create/edit) |  | 3 columns: Name, Object, Endpoint URL · action “New Outbound Message” |
| ☐ | Send Actions | Workflow Actions | List | Read-only view / monitor |  | 2 columns: Name, Object |
| ☐ | Tasks | Workflow Actions | List | Config records (create/edit) |  | 4 columns: Subject, Object, Assigned To, Priority · action “New Task” |
| ☐ | Workflow Rules |  | List | Config records (create/edit) | yes | 5 columns: Rule Name, Object, Active, Evaluation Criteria, Last Modified · action “New Rule” |

## PLATFORM TOOLS › User Interface (20)

|  | Page | Sub-section | Kind | Class | Engine? | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | Action Link Templates |  | List | Config records (create/edit) |  | 3 columns: Name, Category, Last Modified · action “New” |
| ☐ | App Menu |  | List | Read-only view / monitor |  | 3 columns: Item, Type, Visible |
| ☐ | Custom Labels |  | List | Config records (create/edit) |  | 6 columns: Name, Category, Language, Value, Protected, Last Modified · action “New Custom Label” |
| ☐ | Global Actions |  | List | Config records (create/edit) |  | 4 columns: Label, Type, Name, Last Modified · action “New Action” |
| ☐ | Publisher Layouts |  | List | Read-only view / monitor |  | 3 columns: Layout Name, Assigned Profiles, Last Modified |
| ☐ | Lightning App Builder |  | List | Config records (create/edit) |  | 5 columns: Label, Type, Object, Description, Last Modified · action “New” |
| ☐ | Path Settings |  | List | Config records (create/edit) |  | 3 columns: Path Name, Object, Active · action “New Path” |
| ☐ | Quick Text Settings |  | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Enable Quick Text (bool), Enable Quick Text in Chat (bool) |
| ☐ | Rename Tabs and Labels |  | List | Read-only view / monitor |  | 3 columns: Tab, Original Label, Renamed Label |
| ☐ | Custom URLs | Sites and Domains | List | Config records (create/edit) |  | 3 columns: Domain, Site, URL · action “New Custom URL” |
| ☐ | Domains | Sites and Domains | List | Config records (create/edit) |  | 3 columns: Domain Name, Status, Created By · action “Add Domain” |
| ☐ | Sites | Sites and Domains | List | Config records (create/edit) |  | 4 columns: Site Label, Site Name, Status, Default Web Address · action “New” |
| ☐ | Tabs | Sites and Domains | List | Config records (create/edit) |  | 3 columns: Tab Label, Type, Status · action “New” |
| ☐ | Themes and Branding |  | Themes & Branding (builder) | Bespoke builder / viewer |  |  |
| ☐ | Export | Translation Workbench | Info / call-to-action page | Tool / one-shot action | yes | Export Translations — Export source or translation files for translation. — CTA “Export” |
| ☐ | Import | Translation Workbench | Info / call-to-action page | Tool / one-shot action | yes | Import Translations — Import translated files (STF). — CTA “Choose File” |
| ☐ | Override | Translation Workbench | Info / call-to-action page | Tool / one-shot action |  | Override Translations — Override packaged component labels. — CTA “Override” |
| ☐ | Translate | Translation Workbench | Info / call-to-action page | Tool / one-shot action | yes | Translate — Translate custom labels and field names. — CTA “Translate” |
| ☐ | Translation Settings | Translation Workbench | Settings form | Settings (stored flags/fields) | yes | 2 fields in 1 section(s): Enable Translation Workbench (bool), Languages (text) |
| ☐ | User Interface |  | Settings form | Settings (stored flags/fields) |  | 10 fields in 3 section(s): Enable Collapsible Sections (bool), Show Quick Create (bool), Enable Hover Details (bool), Enable Inline Editing (bool), Enable Enhanced Lists (bool), Enable Streamlined Setup (bool), … (+4) |

## PLATFORM TOOLS › Custom Code (19)

|  | Page | Sub-section | Kind | Class | Engine? | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | API |  | List | Read-only view / monitor |  | 3 columns: WSDL, Description, Download |
| ☐ | Apex Classes |  | List | Config records (create/edit) |  | 7 columns: Name, Namespace Prefix, API Version, Status, Size Without Comments, Last Modified By, Last Modified · views: All · action “New” |
| ☐ | Apex Settings |  | Settings form | Settings (stored flags/fields) |  | 4 fields in 1 section(s): Enable Apex Metadata API support (bool), Disable Parallel Apex Testing (bool), Store Only Aggregate Code Coverage (bool), Enable Compile On Deploy (bool) |
| ☐ | Apex Test Execution |  | List | Config records (create/edit) |  | 5 columns: Test Class, Methods, Pass, Fail, Last Run · action “Select Tests…” |
| ☐ | Apex Test History |  | List | Read-only view / monitor |  | 6 columns: Test Run, Test Class, Outcome, Run Time, Run By, Date |
| ☐ | Apex Triggers |  | List | Config records (create/edit) | yes | 7 columns: Name, Namespace Prefix, sObject Type, API Version, Status, Last Modified By, Last Modified · action “New” |
| ☐ | Canvas App Previewer |  | Info / call-to-action page | Tool / one-shot action |  | Canvas App Previewer — Preview canvas apps before publishing them. — CTA “Select App” |
| ☐ | Custom Metadata Types |  | List | Config records (create/edit) |  | 6 columns: Label, Plural Label, API Name, Visibility, Description, Last Modified · action “New Custom Metadata Type” |
| ☐ | Custom Permissions |  | List | Config records (create/edit) |  | 5 columns: Label, Name, Description, Connected App, Last Modified · action “New” |
| ☐ | Custom Settings |  | List | Config records (create/edit) |  | 6 columns: Label, Settings Type, Visibility, Description, Namespace, Last Modified · action “New” |
| ☐ | Email Services |  | List | Config records (create/edit) |  | 4 columns: Name, Apex Class, Status, Email Address · action “New Email Service” |
| ☐ | Lightning Components |  | List | Read-only view / monitor |  | 5 columns: Label, Name, Type, API Version, Last Modified |
| ☐ | Lightning Locker |  | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Enable Lightning Web Security (bool), Lightning Locker for Aura (bool) |
| ☐ | Platform Cache |  | Dashboard page | Monitoring dashboard |  | Platform Cache provides Org and Session cache partitions. |
| ☐ | Remote Access |  | List | Config records (create/edit) |  | 6 columns: Name, Version, Publisher, Start URL, Created By, Created Date · action “New Connected App” |
| ☐ | Static Resources |  | List | Config records (create/edit) |  | 6 columns: Name, Description, MIME Type, Size (bytes), Cache Control, Last Modified · action “New” |
| ☐ | Tools |  | List | Read-only view / monitor |  | 2 columns: Tool, Description |
| ☐ | Visualforce Components |  | List | Config records (create/edit) |  | 4 columns: Label, Name, Description, Last Modified · action “New” |
| ☐ | Visualforce Pages |  | List | Config records (create/edit) |  | 5 columns: Label, Name, Description, API Version, Last Modified · action “New” |

## PLATFORM TOOLS › Environments (18)

|  | Page | Sub-section | Kind | Class | Engine? | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | Deployment Settings | Deploy | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Allow deployments from outside orgs (bool), Require tests on deploy (bool) |
| ☐ | Deployment Status | Deploy | List | Read-only view / monitor |  | 6 columns: Deployment, Status, Components, Tests, Deployed By, Date |
| ☐ | Apex Flex Queue | Jobs | List | Read-only view / monitor |  | 4 columns: Job, Apex Class, Submitted, Position |
| ☐ | Apex Jobs | Jobs | List | Read-only view / monitor |  | 9 columns: Submitted Date, Job Type, Status, Apex Class, Total Batches, Batches Processed, Failures, Submitted By, … (+1) |
| ☐ | Background Jobs | Jobs | List | Read-only view / monitor |  | 4 columns: Job, Type, Status, Started |
| ☐ | Bulk Data Load Jobs | Jobs | List | Read-only view / monitor |  | 7 columns: Job ID, Object, Operation, Records, Status, Submitted By, Date |
| ☐ | Scheduled Jobs | Jobs | List | Read-only view / monitor | yes | 7 columns: Action, Job Name, Submitted By, Submitted, Started, Next Scheduled Run, Type |
| ☐ | Debug Logs | Logs | Debug-log viewer | Bespoke builder / viewer |  |  |
| ☐ | Email Log Files | Logs | Info / call-to-action page | Tool / one-shot action |  | Email Log Files — Request a log of emails sent from your org during the past 30 days. — CTA “Request an Email Log” |
| ☐ | Event Monitoring Setup | Logs | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Generate Event Log Files (bool), Enable Real-Time Event Monitoring (bool) |
| ☐ | API Usage Notifications | Monitoring | List | Config records (create/edit) |  | 5 columns: Name, Threshold, Frequency, Recipients, Active · action “New Notification” |
| ☐ | Case Escalations | Monitoring | List | Read-only view / monitor | yes | 4 columns: Case, Rule, Escalated, Owner |
| ☐ | Email Snapshots | Monitoring | Info / call-to-action page | Tool / one-shot action | yes | Email Snapshots — Capture the contents of outbound email for troubleshooting. — CTA “New Snapshot” |
| ☐ | Outbound Messages Monitor | Monitoring | List | Read-only view / monitor |  | 5 columns: Message ID, Endpoint, Attempts, Last Attempt, Status |
| ☐ | Time-Based Workflow | Monitoring | Info / call-to-action page | Tool / one-shot action | yes | Time-Based Workflow — Monitor time-dependent workflow actions waiting to execute. — CTA “Search” |
| ☐ | System Overview |  | System overview | Bespoke builder / viewer |  |  |
| ☐ | Integrations |  | Info / call-to-action page | Tool / one-shot action |  | Integrations — Manage integrations between your org and other systems. — CTA “View Integrations” |
| ☐ | Lightning Experience Transition Assistant |  | Dashboard page | Monitoring dashboard |  | Prepare and roll out Lightning Experience to your users. |

## SETTINGS › Company Settings (10)

|  | Page | Sub-section | Kind | Class | Engine? | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | Business Hours |  | List | Config records (create/edit) |  | 5 columns: Business Hours Name, Active, Default, Time Zone, Last Modified · action “New Business Hours” |
| ☐ | Calendar Settings |  | Settings form | Settings (stored flags/fields) |  | 6 fields in 1 section(s): Enable Home Page Hover Links for Events (bool), Enable Drag-and-Drop Editing on Calendar Views (bool), Enable Click-and-Create Events on Calendar Views (bool), Enable Multi-User Calendar View (bool), Enable Shared Calendars (bool), Default calendar access (select) |
| ☐ | Public Calendars and Resources |  | List | Config records (create/edit) |  | 3 columns: Name, Type, Active · action “New Calendar” |
| ☐ | Company Information |  | Detail page | Bespoke builder / viewer |  | Company Information |
| ☐ | Critical Updates |  | List | Read-only view / monitor |  | 4 columns: Name, Description, Auto-Activation Date, Status |
| ☐ | Data Protection and Privacy |  | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Enable Data Protection and Privacy (bool), Enable Consent Management (bool), Enable Mask Sensitive Fields in Sandbox (bool) |
| ☐ | Fiscal Year |  | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Fiscal year setup (select), Fiscal year starts in (select), Fiscal year is based on (select) |
| ☐ | Holidays |  | List | Config records (create/edit) |  | 4 columns: Holiday Name, Date, Recurring, Business Hours · action “New” |
| ☐ | Language Settings |  | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Enable End User Languages (bool), Default (text), Additional (text) |
| ☐ | My Domain |  | Detail page | Bespoke builder / viewer |  | My Domain |

## SETTINGS › Identity (8)

|  | Page | Sub-section | Kind | Class | Engine? | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | Auth. Providers |  | List | Config records (create/edit) |  | 5 columns: Name, Provider Type, URL Suffix, Consumer Key, Created · action “New” |
| ☐ | Identity Connect |  | Info / call-to-action page | Tool / one-shot action |  | Identity Connect — Integrate Active Directory with your org. — CTA “Install” |
| ☐ | Identity Provider |  | Settings form | Settings (stored flags/fields) |  | 3 fields in 1 section(s): Identity Provider enabled (bool), Certificate (text), Entity ID (text) |
| ☐ | Identity Verification |  | Settings form | Settings (stored flags/fields) |  | 2 fields in 1 section(s): Require identity verification (bool), Verification methods (select) |
| ☐ | Identity Verification History |  | List | Read-only view / monitor |  | 5 columns: User, Method, Result, Location, Date |
| ☐ | Login Flows |  | List | Config records (create/edit) | yes | 3 columns: Flow Name, Profile, Active · action “New” |
| ☐ | Login History |  | List | Read-only view / monitor |  | 9 columns: Username, Login Time, Source IP, Location, Login Type, Status, Browser, Platform, … (+1) |
| ☐ | Single Sign-On Settings |  | List | Config records (create/edit) | yes | 4 columns: Name, SAML Version, Issuer, Status · action “New” |

## SETTINGS › Security (21)

|  | Page | Sub-section | Kind | Class | Engine? | Contents |
| --- | --- | --- | --- | --- | --- | --- |
| ☐ | Activations |  | List | Read-only view / monitor |  | 3 columns: Activation Name, Type, Location |
| ☐ | CORS |  | List | Config records (create/edit) |  | 3 columns: Origin URL Pattern, Created By, Created · action “New” |
| ☐ | CSP Trusted Sites |  | List | Config records (create/edit) |  | 4 columns: Trusted Site Name, URL, Active, Context · action “New Trusted Site” |
| ☐ | Certificate and Key Management |  | List | Config records (create/edit) |  | 5 columns: Label, Unique Name, Type, Expiration Date, Key Size · action “Create Self-Signed Certificate” |
| ☐ | Delegated Administration |  | List | Config records (create/edit) | yes | 3 columns: Group Name, Members, Created By · action “New” |
| ☐ | Expire All Passwords |  | Info / call-to-action page | Tool / one-shot action | yes | Expire All Passwords — Force all users to change their passwords the next time they log in. — CTA “Expire All Passwords” |
| ☐ | Field Accessibility |  | List | Read-only view / monitor |  | 4 columns: Object, Field, Profile, Access |
| ☐ | File Upload and Download Security |  | Settings form | Settings (stored flags/fields) |  | 5 fields in 2 section(s): HTML (select), PDF (select), SVG (select), Don’t allow HTML uploads as attachments or document records (bool), Add the Content-Disposition header (bool) |
| ☐ | Health Check |  | Health check | Bespoke builder / viewer |  |  |
| ☐ | Login Access Policies |  | Settings form | Settings (stored flags/fields) | yes | 2 fields in 1 section(s): Administrators Can Log in as Any User (bool), Allow users to review Salesforce.com support access (bool) |
| ☐ | Named Credentials |  | List | Config records (create/edit) |  | 5 columns: Label, Name, URL, Identity Type, Last Modified · action “New Legacy” |
| ☐ | Network Access |  | List | Config records (create/edit) |  | 4 columns: Start IP Address, End IP Address, Description, Action · action “New” |
| ☐ | Password Policies |  | Settings form | Settings (stored flags/fields) | yes | 9 fields in 1 section(s): User passwords expire in (select), Enforce password history (select), Minimum password length (select), Password complexity requirement (select), Password question requirement (select), Maximum invalid login attempts (select), … (+3) |
| ☐ | Platform Encryption |  | Settings form | Settings (stored flags/fields) | yes | 3 fields in 1 section(s): Enable encryption (bool), Tenant secret (text), Encrypted fields (text) |
| ☐ | Remote Site Settings |  | List | Config records (create/edit) |  | 4 columns: Remote Site Name, Remote Site URL, Active, Description · action “New Remote Site” |
| ☐ | Session Management |  | List | Read-only view / monitor | yes | 5 columns: Username, Session Type, Source IP, Login Time, Last Activity |
| ☐ | Session Settings |  | Settings form | Settings (stored flags/fields) | yes | 10 fields in 1 section(s): Timeout value (select), Disable session timeout warning popup (bool), Force logout on session timeout (bool), Lock sessions to the IP address from which they originated (bool), Lock sessions to the domain in which they were first used (bool), Require secure connections (HTTPS) (bool), … (+4) |
| ☐ | Sharing Settings |  | Sharing settings | Bespoke builder / viewer | yes |  |
| ☐ | Transaction Security |  | List | Config records (create/edit) | yes | 4 columns: Policy Name, Event Type, Active, Last Modified · action “New” |
| ☐ | View Setup Audit Trail |  | List | Read-only view / monitor |  | 6 columns: Date, User, Source Namespace Prefix, Action, Section, Delegate User |
| ☐ | Optimizer |  | Dashboard page | Monitoring dashboard |  | Optimizer scans your org and provides recommendations. |
