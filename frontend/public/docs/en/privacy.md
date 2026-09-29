# Privacy Policy

Effective date: September 30, 2026  
Operator: Pai Kuan Chang (QJudge)  
Contact: [quan787887@gmail.com](mailto:quan787887@gmail.com)

## Scope

This policy covers the website, MCP server and ChatGPT Plugin integration operated at q-judge.com. The service is available globally and currently serves users primarily in Taiwan. Institutions operating their own QJudge deployment must provide their own privacy notice; this policy does not describe those deployments.

Schools and instructors decide the purposes of their courses, membership permissions and educational record requirements. QJudge processes data through configured features and authorized operations. Users must have authority to upload or share student data.

## Data and purposes

Depending on the features you use, we process:

- Account data: usernames, email addresses, display names, roles, password hashes or third-party login identifiers, for authentication and access management.
- Educational data: rosters, questions, source code, answers, grades and feedback, for classes, exams, judging and grading.
- Tool and AI data: tool inputs and results, conversations and execution records, and OAuth authorization information, to perform requested searches, authoring, grading and other authorized actions.
- Exam integrity data: when enabled by an institution, exam events, device/session information and screen or camera evidence, for instructor review.
- Technical data: IP addresses, requests, login, security and error records, to operate the service, troubleshoot issues, prevent abuse and provide support.

Necessary account data is required to sign in. Declining data required by a particular exam feature may prevent its use; ask your institution about alternatives.

## ChatGPT, AI and other services

When you use the ChatGPT Plugin, QJudge receives tool inputs and returns results permitted by your account to OpenAI. Results may include the questions, answers, grades and feedback you choose to access. OpenAI separately processes ChatGPT conversations and tool data under its own terms and privacy policy; QJudge does not control those retention settings.

The QJudge website's AI features send prompts, necessary conversation context, questions, answers or tool results to the selected model provider. The production model configuration includes DeepSeek, OpenAI and a campus model endpoint at chatapi.ntubimdbirc.tw. The relevant provider is used when that feature runs. Confirm that the data is appropriate to send and review AI outputs before using them.

We use operator-managed application servers, databases and MinIO object storage. Cloudflare provides website connectivity and security, and Google SMTP delivers email. Google, GitHub or National Yang Ming Chiao Tung University processes login information when you select its sign-in option. These services, OpenAI and DeepSeek may process data outside Taiwan depending on their infrastructure and routing. We do not promise Taiwan-only storage or processing.

We do not sell personal data. Information is shared only as needed to provide the service, carry out your authorization, support institution administration or comply with law, with authorized course managers, these service providers or legally entitled authorities.

## Retention and deletion

Accounts, classes, questions, answers, grades and AI execution data currently have no uniform automatic expiration period. They remain until authorized deletion, account-closure processing or cleanup under institutional record requirements. Stopping use or disconnecting ChatGPT does not automatically delete educational records from QJudge. Exam evidence files likewise have no site-wide automatic expiration period; contact your course administrator or the address below to request handling.

Application diagnostic logs rotate by size, at approximately 15 MB per file with up to 10 rotated files, not on a fixed schedule. The deployment backup tool retains the latest 10 database backup batches and removes older batches when subsequent backups run. This is not a fixed calendar deadline. Copies in existing backups may remain until rotation after primary records are deleted. Database backup rotation does not automatically remove object-storage files.

You may request account closure or data deletion. We verify identity, scope and institutional responsibility, handle requests under applicable law, and explain the expected process and timing. If law, disputes or formal educational record requirements require retaining some information, we explain the applicable reason. Third-party copies are governed separately by that provider's retention and deletion rules.

## Cookies and security

QJudge uses cookies and browser storage for login, security, language, appearance and essential functionality. Login providers and Cloudflare may use additional cookies needed for their services. Browser settings allow cookie management; disabling necessary cookies may prevent sign-in or other features.

We use password hashing, access controls, encrypted transport and security records to protect information. No system guarantees absolute security. We handle legally required incident notifications under applicable law.

## Your rights and contact

You may request access, copies, correction, cessation of processing or deletion as provided by applicable law. Rights under Taiwan's [Personal Data Protection Act](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021) and other applicable mandatory laws are not limited by this policy.

Email [quan787887@gmail.com](mailto:quan787887@gmail.com) with the subject “QJudge personal data request,” your account identifier and request scope. Do not send passwords or tokens. Institution-managed records may require coordination with that institution.

The ChatGPT Plugin is not directed to children under 13. Do not send their personal information to OpenAI through this integration.

## Changes

We publish revisions and effective dates here and notify users of material changes as required by law. The [Terms of Service](/docs/terms) also apply.
