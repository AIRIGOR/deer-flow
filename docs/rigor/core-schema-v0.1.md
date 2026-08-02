\# RIGOR Core Schema v0.1



\## Purpose



The RIGOR Core Schema defines how production information is stored, traced, compared, reviewed, and resolved.



RIGOR must convert information from riders, venue documents, FEQs, schedules, plots, emails, and crew updates into structured show records.



\## Core Rules



1\. Every fact must identify its source.

2\. Every source must preserve its document and page reference.

3\. Missing information must be marked `NEEDS\_CONFIRMATION`.

4\. Conflicting information must never be silently overwritten.

5\. AI-generated conclusions must remain separate from confirmed facts.

6\. High-risk changes require human review.

7\. Every update must preserve an audit history.



\## Entity 1: Show



A Show is the primary record that connects all documents, requirements, contacts, risks, conflicts, and decisions for one production date.



\### Required Fields



\- `show\_id`: Unique system-generated identifier

\- `tour\_name`: Name of the tour or production

\- `artist\_or\_client`: Artist, client, or event owner

\- `show\_name`: Public or internal show name

\- `venue\_name`: Confirmed venue name

\- `city`: Venue city

\- `state\_region`: State, province, or region

\- `country`: Venue country

\- `timezone`: Local venue timezone

\- `load\_in\_at`: Scheduled load-in date and time

\- `doors\_at`: Scheduled doors date and time

\- `show\_at`: Scheduled show date and time

\- `curfew\_at`: Venue curfew date and time

\- `show\_status`: Current workflow status

\- `created\_at`: Record creation timestamp

\- `updated\_at`: Most recent update timestamp



\### Allowed Show Status Values



\- `DOCUMENTS\_PENDING`

\- `INITIAL\_REVIEW`

\- `ADVANCE\_IN\_PROGRESS`

\- `NEEDS\_CONFIRMATION`

\- `CONFLICTS\_OPEN`

\- `DEPARTMENT\_REVIEW`

\- `SHOW\_READY`

\- `SHOW\_COMPLETE`

\- `POST\_SHOW\_REVIEW`

\- `ARCHIVED`



\## Entity 2: Document



A Document is any file, email, message, image, or written update used as evidence for a show.



\### Required Fields



\- `document\_id`: Unique system-generated identifier

\- `show\_id`: Show connected to the document

\- `document\_name`: Original file or message name

\- `document\_type`: Classified document category

\- `source\_party`: Person, company, venue, or department that supplied it

\- `revision`: Document revision or version

\- `document\_date`: Date shown within the document

\- `received\_at`: Date and time RIGOR received it

\- `file\_format`: PDF, DOCX, XLSX, image, email, text, or other format

\- `page\_count`: Total number of pages when applicable

\- `storage\_location`: Secure file reference

\- `processing\_status`: Current ingestion status

\- `supersedes\_document\_id`: Earlier document replaced by this revision

\- `created\_at`: Record creation timestamp

\- `updated\_at`: Most recent update timestamp



\### Allowed Document Types



\- `RIDER`

\- `VENUE\_TECHNICAL\_PACKAGE`

\- `FEQ`

\- `PRODUCTION\_SCHEDULE`

\- `LABOR\_CALL`

\- `RIGGING\_PLOT`

\- `POWER\_PLAN`

\- `LED\_SPECIFICATION`

\- `CAMERA\_PLOT`

\- `SIGNAL\_FLOW`

\- `CONTACT\_SHEET`

\- `EMAIL`

\- `CREW\_UPDATE`

\- `OTHER`



\### Allowed Processing Status Values



\- `RECEIVED`

\- `CLASSIFYING`

\- `EXTRACTING`

\- `NEEDS\_REVIEW`

\- `PROCESSED`

\- `FAILED`

\- `SUPERSEDED`

\## Entity 3: Requirement



A Requirement is one operational fact, specification, request, limitation, or commitment connected to a show.



Each requirement must remain linked to its original evidence.



\### Required Fields



\- `requirement\_id`: Unique system-generated identifier

\- `show\_id`: Show connected to the requirement

\- `department`: Department affected by the requirement

\- `category`: Operational category within the department

\- `requirement\_text`: Requirement written in clear language

\- `normalized\_value`: Structured value used for comparison

\- `unit`: Measurement unit when applicable

\- `origin\_type`: Source, human confirmation, or AI inference

\- `document\_id`: Source document identifier

\- `source\_page`: Source page number when applicable

\- `source\_location`: Section, table, paragraph, email, or message reference

\- `source\_excerpt`: Limited supporting text from the source

\- `confidence`: Extraction confidence from 0.00 to 1.00

\- `requirement\_status`: Current confirmation status

\- `owner`: Person or department responsible for resolution

\- `due\_at`: Resolution deadline when applicable

\- `created\_at`: Record creation timestamp

\- `updated\_at`: Most recent update timestamp



\### Allowed Origin Types



\- `SOURCE\_DOCUMENT`

\- `EMAIL\_CONFIRMATION`

\- `VERBAL\_CONFIRMATION`

\- `CREW\_UPDATE`

\- `AI\_INFERENCE`

\- `HUMAN\_ENTRY`



\### Allowed Requirement Status Values



\- `UNKNOWN`

\- `EXTRACTED`

\- `NEEDS\_CONFIRMATION`

\- `REQUESTED`

\- `CONFIRMED`

\- `CONFLICTING`

\- `REJECTED`

\- `CHANGED`

\- `RESOLVED`

\- `APPROVED`

\- `NOT\_APPLICABLE`



\### Core Requirement Rule



An `AI\_INFERENCE` may identify a possible issue, but it cannot become `CONFIRMED` without supporting evidence or human approval.



\## Entity 4: Conflict



A Conflict exists when two or more sources provide incompatible information about the same operational requirement.



RIGOR must preserve every conflicting value until an authorized person resolves the issue.



\### Required Fields



\- `conflict\_id`: Unique system-generated identifier

\- `show\_id`: Show connected to the conflict

\- `department`: Department primarily affected

\- `category`: Operational category involved

\- `conflict\_type`: Classification of the disagreement

\- `summary`: Clear description of the conflicting information

\- `requirement\_ids`: Requirements involved in the conflict

\- `document\_ids`: Source documents involved

\- `operational\_consequence`: Possible effect on safety, schedule, cost, or show execution

\- `severity`: Current conflict severity

\- `conflict\_status`: Current resolution status

\- `owner`: Person or department responsible for resolution

\- `due\_at`: Deadline for resolution

\- `resolution\_text`: Confirmed resolution

\- `resolved\_by`: Person who approved the resolution

\- `resolved\_at`: Resolution timestamp

\- `created\_at`: Record creation timestamp

\- `updated\_at`: Most recent update timestamp



\### Allowed Conflict Types



\- `VALUE\_MISMATCH`

\- `SCHEDULE\_MISMATCH`

\- `REVISION\_CHANGE`

\- `CAPACITY\_SHORTFALL`

\- `DIMENSION\_MISMATCH`

\- `CONTACT\_MISMATCH`

\- `RESPONSIBILITY\_MISMATCH`

\- `MISSING\_DEPENDENCY`

\- `OTHER`



\### Allowed Severity Values



\- `CRITICAL`

\- `HIGH`

\- `MEDIUM`

\- `LOW`



\### Allowed Conflict Status Values



\- `OPEN`

\- `UNDER\_REVIEW`

\- `AWAITING\_RESPONSE`

\- `PROPOSED\_RESOLUTION`

\- `RESOLVED`

\- `ACCEPTED\_RISK`

\- `CLOSED`



\### Core Conflict Rule



Resolving a conflict must never delete or overwrite the original conflicting requirements. The selected resolution must be stored as a separate approved decision.





\## Entity 5: Risk



A Risk is a confirmed or potential condition that may affect safety, schedule, cost, technical execution, or show readiness.



A risk may be created from a requirement, conflict, missing dependency, revision change, or approved human observation.



\### Required Fields



\- `risk\_id`: Unique system-generated identifier

\- `show\_id`: Show connected to the risk

\- `department`: Department primarily affected

\- `category`: Operational category involved

\- `risk\_title`: Short name for the risk

\- `risk\_description`: Clear explanation of the condition

\- `risk\_source\_type`: Origin of the risk

\- `requirement\_ids`: Related requirements when applicable

\- `conflict\_ids`: Related conflicts when applicable

\- `document\_ids`: Supporting documents when applicable

\- `safety\_impact`: Safety impact score from 0 to 5

\- `show\_impact`: Show execution impact score from 0 to 5

\- `schedule\_impact`: Schedule impact score from 0 to 5

\- `financial\_impact`: Financial impact score from 0 to 5

\- `department\_impact`: Number of departments affected

\- `time\_urgency`: Urgency score from 0 to 5

\- `confidence`: Evidence confidence from 0.00 to 1.00

\- `risk\_score`: Calculated total risk score

\- `severity`: Calculated or human-approved severity

\- `risk\_status`: Current handling status

\- `owner`: Person or department responsible

\- `mitigation\_plan`: Action intended to reduce the risk

\- `due\_at`: Deadline for mitigation or decision

\- `approved\_by`: Person approving the final classification

\- `created\_at`: Record creation timestamp

\- `updated\_at`: Most recent update timestamp



\### Allowed Risk Source Types



\- `REQUIREMENT`

\- `CONFLICT`

\- `MISSING\_INFORMATION`

\- `REVISION\_CHANGE`

\- `AI\_DETECTION`

\- `HUMAN\_OBSERVATION`

\- `POST\_SHOW\_LESSON`



\### Allowed Risk Status Values



\- `IDENTIFIED`

\- `UNDER\_REVIEW`

\- `ACTION\_REQUIRED`

\- `MITIGATION\_IN\_PROGRESS`

\- `MITIGATED`

\- `ACCEPTED`

\- `ESCALATED`

\- `CLOSED`



\### Allowed Severity Values



\- `CRITICAL`

\- `HIGH`

\- `MEDIUM`

\- `LOW`



\### Core Risk Rule



An AI-generated risk may be prioritized automatically, but any safety-critical classification or accepted risk must receive human approval.



\## Entity 6: Advance Question



An Advance Question is a specific request for missing information, clarification, confirmation, or resolution.



A question may be generated by RIGOR or entered by an authorized human.



\### Required Fields



\- `question\_id`: Unique system-generated identifier

\- `show\_id`: Show connected to the question

\- `department`: Department affected by the answer

\- `category`: Operational category involved

\- `question\_type`: Reason the question was created

\- `question\_text`: Clear question written for the recipient

\- `question\_reason`: Operational reason the answer is required

\- `requirement\_ids`: Related requirements when applicable

\- `conflict\_ids`: Related conflicts when applicable

\- `risk\_ids`: Related risks when applicable

\- `document\_ids`: Supporting documents when applicable

\- `recipient\_name`: Person expected to answer

\- `recipient\_role`: Recipient's production role

\- `recipient\_company`: Recipient's company, venue, or organization

\- `delivery\_method`: Email, platform, phone, meeting, or other method

\- `priority`: Operational priority

\- `question\_status`: Current workflow status

\- `generated\_by`: AI, human, or system rule

\- `approved\_by`: Human who approved sending when required

\- `sent\_at`: Date and time the question was issued

\- `due\_at`: Requested response deadline

\- `closed\_at`: Date and time the question was closed

\- `created\_at`: Record creation timestamp

\- `updated\_at`: Most recent update timestamp



\### Allowed Question Types



\- `MISSING\_INFORMATION`

\- `CONFIRMATION\_REQUEST`

\- `CONFLICT\_RESOLUTION`

\- `CAPACITY\_VERIFICATION`

\- `SCHEDULE\_CLARIFICATION`

\- `RESPONSIBILITY\_CLARIFICATION`

\- `REVISION\_CLARIFICATION`

\- `SAFETY\_CLARIFICATION`

\- `OTHER`



\### Allowed Priority Values



\- `CRITICAL`

\- `HIGH`

\- `MEDIUM`

\- `LOW`



\### Allowed Question Status Values



\- `DRAFT`

\- `AWAITING\_APPROVAL`

\- `APPROVED`

\- `SENT`

\- `RESPONSE\_RECEIVED`

\- `FOLLOW\_UP\_REQUIRED`

\- `ANSWERED`

\- `CLOSED`

\- `CANCELLED`



\### Allowed Generated By Values



\- `AI`

\- `HUMAN`

\- `SYSTEM\_RULE`



\### Core Advance Question Rule



Every question must explain why the information is operationally necessary. RIGOR must not send high-risk, safety-related, or externally sensitive questions without human approval.





\## Entity 7: Response



A Response is information received in answer to an Advance Question.



A response may confirm, clarify, reject, modify, or fail to resolve the issue that created the question.



\### Required Fields



\- `response\_id`: Unique system-generated identifier

\- `show\_id`: Show connected to the response

\- `question\_id`: Advance Question being answered

\- `responder\_name`: Person who supplied the response

\- `responder\_role`: Responder's production role

\- `responder\_company`: Responder's company, venue, or organization

\- `response\_method`: Email, platform, phone, meeting, verbal, or other method

\- `response\_text`: Complete response in clear language

\- `received\_at`: Date and time the response was received

\- `document\_ids`: Supporting documents or attachments

\- `source\_location`: Email thread, message, meeting note, or other source reference

\- `response\_status`: Current review status

\- `resolution\_effect`: Effect of the response on the related issue

\- `reviewed\_by`: Human who reviewed the response when required

\- `reviewed\_at`: Review timestamp

\- `created\_at`: Record creation timestamp

\- `updated\_at`: Most recent update timestamp



\### Allowed Response Methods



\- `EMAIL`

\- `PLATFORM`

\- `PHONE`

\- `MEETING`

\- `VERBAL`

\- `DOCUMENT`

\- `OTHER`



\### Allowed Response Status Values



\- `RECEIVED`

\- `UNDER\_REVIEW`

\- `ACCEPTED`

\- `PARTIALLY\_ACCEPTED`

\- `REJECTED`

\- `FOLLOW\_UP\_REQUIRED`

\- `SUPERSEDED`



\### Allowed Resolution Effect Values



\- `CONFIRMS\_REQUIREMENT`

\- `CHANGES\_REQUIREMENT`

\- `RESOLVES\_CONFLICT`

\- `REDUCES\_RISK`

\- `CREATES\_NEW\_CONFLICT`

\- `CREATES\_NEW\_RISK`

\- `INCOMPLETE`

\- `NO\_CHANGE`



\### Core Response Rule



A response must not automatically resolve a requirement, conflict, or risk unless the response is traceable, reviewed when necessary, and approved by an authorized human.







\## Entity 8: Decision



A Decision is the approved operational conclusion used to resolve a conflict, accept a risk, confirm a requirement, or establish the final plan.



A decision must preserve the evidence and records that led to it.



\### Required Fields



\- `decision\_id`: Unique system-generated identifier

\- `show\_id`: Show connected to the decision

\- `decision\_type`: Operational purpose of the decision

\- `department`: Department primarily affected

\- `category`: Operational category involved

\- `decision\_title`: Short name for the decision

\- `decision\_text`: Complete approved decision

\- `decision\_reason`: Explanation of why the decision was selected

\- `requirement\_ids`: Related requirements when applicable

\- `conflict\_ids`: Related conflicts when applicable

\- `risk\_ids`: Related risks when applicable

\- `question\_ids`: Related Advance Questions when applicable

\- `response\_ids`: Related responses when applicable

\- `document\_ids`: Supporting documents when applicable

\- `decision\_status`: Current approval status

\- `effective\_at`: Date and time the decision becomes active

\- `expires\_at`: Date and time the decision expires when applicable

\- `approved\_by`: Authorized person approving the decision

\- `approved\_at`: Approval timestamp

\- `supersedes\_decision\_id`: Earlier decision replaced by this decision

\- `created\_at`: Record creation timestamp

\- `updated\_at`: Most recent update timestamp



\### Allowed Decision Types



\- `REQUIREMENT\_CONFIRMATION`

\- `CONFLICT\_RESOLUTION`

\- `RISK\_ACCEPTANCE`

\- `RISK\_MITIGATION`

\- `SCHEDULE\_APPROVAL`

\- `TECHNICAL\_APPROVAL`

\- `RESPONSIBILITY\_ASSIGNMENT`

\- `REVISION\_APPROVAL`

\- `SHOW\_READINESS\_APPROVAL`

\- `OTHER`



\### Allowed Decision Status Values



\- `DRAFT`

\- `UNDER\_REVIEW`

\- `APPROVED`

\- `REJECTED`

\- `ACTIVE`

\- `SUPERSEDED`

\- `EXPIRED`

\- `REVOKED`



\### Core Decision Rule



A decision must never erase the requirements, conflicts, risks, questions, responses, or documents that produced it. Any revised decision must be stored as a new record linked to the decision it supersedes.





\## Entity 9: Audit Event



An Audit Event records every significant creation, update, approval, rejection, status change, or automated action within RIGOR.



Audit events are permanent and must not be edited or deleted through normal system operation.



\### Required Fields



\- `audit\_event\_id`: Unique system-generated identifier

\- `show\_id`: Show connected to the event

\- `entity\_type`: Type of record affected

\- `entity\_id`: Identifier of the affected record

\- `action\_type`: Action performed

\- `actor\_type`: Human, AI, system rule, or integration

\- `actor\_id`: Identifier of the person or system performing the action

\- `actor\_name`: Display name of the person or system

\- `previous\_value`: Record value before the action when applicable

\- `new\_value`: Record value after the action when applicable

\- `change\_reason`: Explanation for the action

\- `source\_reference`: Supporting document, response, decision, or system event

\- `approval\_required`: Whether human approval was required

\- `approved\_by`: Authorized approver when applicable

\- `occurred\_at`: Exact action timestamp

\- `created\_at`: Audit record creation timestamp



\### Allowed Entity Types



\- `SHOW`

\- `DOCUMENT`

\- `REQUIREMENT`

\- `CONFLICT`

\- `RISK`

\- `ADVANCE\_QUESTION`

\- `RESPONSE`

\- `DECISION`

\- `CONTACT`

\- `POST\_SHOW\_LESSON`

\- `SYSTEM\_CONFIGURATION`



\### Allowed Action Types



\- `CREATED`

\- `UPDATED`

\- `STATUS\_CHANGED`

\- `APPROVED`

\- `REJECTED`

\- `ASSIGNED`

\- `SENT`

\- `RECEIVED`

\- `RESOLVED`

\- `SUPERSEDED`

\- `ARCHIVED`

\- `AI\_GENERATED`

\- `IMPORTED`

\- `EXPORTED`



\### Allowed Actor Types



\- `HUMAN`

\- `AI`

\- `SYSTEM\_RULE`

\- `INTEGRATION`



\### Core Audit Rule



An audit event must remain immutable. Corrections must be stored as additional audit events rather than altering or deleting the original history.





\## Entity 9: Audit Event



An Audit Event records every significant creation, update, approval, rejection, status change, or automated action within RIGOR.



Audit events are permanent and must not be edited or deleted through normal system operation.



\### Required Fields



\- `audit\_event\_id`: Unique system-generated identifier

\- `show\_id`: Show connected to the event

\- `entity\_type`: Type of record affected

\- `entity\_id`: Identifier of the affected record

\- `action\_type`: Action performed

\- `actor\_type`: Human, AI, system rule, or integration

\- `actor\_id`: Identifier of the person or system performing the action

\- `actor\_name`: Display name of the person or system

\- `previous\_value`: Record value before the action when applicable

\- `new\_value`: Record value after the action when applicable

\- `change\_reason`: Explanation for the action

\- `source\_reference`: Supporting document, response, decision, or system event

\- `approval\_required`: Whether human approval was required

\- `approved\_by`: Authorized approver when applicable

\- `occurred\_at`: Exact action timestamp

\- `created\_at`: Audit record creation timestamp



\### Allowed Entity Types



\- `SHOW`

\- `DOCUMENT`

\- `REQUIREMENT`

\- `CONFLICT`

\- `RISK`

\- `ADVANCE\_QUESTION`

\- `RESPONSE`

\- `DECISION`

\- `CONTACT`

\- `POST\_SHOW\_LESSON`

\- `SYSTEM\_CONFIGURATION`



\### Allowed Action Types



\- `CREATED`

\- `UPDATED`

\- `STATUS\_CHANGED`

\- `APPROVED`

\- `REJECTED`

\- `ASSIGNED`

\- `SENT`

\- `RECEIVED`

\- `RESOLVED`

\- `SUPERSEDED`

\- `ARCHIVED`

\- `AI\_GENERATED`

\- `IMPORTED`

\- `EXPORTED`



\### Allowed Actor Types



\- `HUMAN`

\- `AI`

\- `SYSTEM\_RULE`

\- `INTEGRATION`



\### Core Audit Rule



An audit event must remain immutable. Corrections must be stored as additional audit events rather than altering or deleting the original history.







\## Entity 10: Contact



A Contact is a person or organization connected to a show, venue, tour, department, vendor, or operational responsibility.



Contacts may be reused across multiple shows, but show-specific responsibilities must remain attached to the correct show.



\### Required Fields



\- `contact\_id`: Unique system-generated identifier

\- `show\_id`: Show connected to the contact when applicable

\- `contact\_type`: Person, company, venue, vendor, or emergency contact

\- `first\_name`: Contact first name when applicable

\- `last\_name`: Contact last name when applicable

\- `display\_name`: Full person or organization name

\- `job\_title`: Production title or organizational role

\- `department`: Primary department

\- `company`: Employer, venue, vendor, or organization

\- `email`: Primary email address

\- `phone`: Primary phone number

\- `secondary\_phone`: Alternate phone number when applicable

\- `timezone`: Contact's working timezone when known

\- `preferred\_method`: Preferred communication method

\- `responsibility`: Operational responsibility for the show

\- `availability\_notes`: Known availability or contact restrictions

\- `contact\_status`: Current verification status

\- `source\_document\_id`: Document where the contact was found

\- `verified\_by`: Person who confirmed the contact information

\- `verified\_at`: Verification timestamp

\- `created\_at`: Record creation timestamp

\- `updated\_at`: Most recent update timestamp



\### Allowed Contact Types



\- `PERSON`

\- `TOUR`

\- `VENUE`

\- `PROMOTER`

\- `VENDOR`

\- `LABOR\_PROVIDER`

\- `EMERGENCY`

\- `OTHER`



\### Allowed Preferred Methods



\- `EMAIL`

\- `PHONE`

\- `TEXT`

\- `PLATFORM`

\- `OTHER`



\### Allowed Contact Status Values



\- `UNVERIFIED`

\- `VERIFIED`

\- `OUTDATED`

\- `UNREACHABLE`

\- `REPLACED`

\- `INACTIVE`



\### Core Contact Rule



RIGOR must not assume that contact information from an older show remains current. Show-critical contacts must be verified before they are treated as active.





\## Entity 11: Post-Show Lesson



A Post-Show Lesson records what actually occurred during load-in, rehearsal, show operation, load-out, or settlement.



These lessons allow RIGOR to compare the advance plan with real-world execution and improve future recommendations.



\### Required Fields



\- `lesson\_id`: Unique system-generated identifier

\- `show\_id`: Show where the lesson was observed

\- `venue\_name`: Venue connected to the lesson

\- `department`: Department primarily affected

\- `category`: Operational category involved

\- `lesson\_type`: Classification of the lesson

\- `lesson\_title`: Short descriptive title

\- `planned\_condition`: What the documents or advance process indicated

\- `actual\_condition`: What occurred during the show

\- `operational\_impact`: Effect on safety, schedule, cost, labor, or execution

\- `root\_cause`: Confirmed or suspected cause

\- `resolution\_used`: Action taken during the show

\- `future\_recommendation`: Recommended action for future shows

\- `requirement\_ids`: Related requirements when applicable

\- `conflict\_ids`: Related conflicts when applicable

\- `risk\_ids`: Related risks when applicable

\- `decision\_ids`: Related decisions when applicable

\- `document\_ids`: Supporting documents when applicable

\- `evidence\_notes`: Supporting observations, reports, photos, or communications

\- `confidence`: Evidence confidence from 0.00 to 1.00

\- `lesson\_status`: Current review and approval status

\- `reported\_by`: Person who submitted the lesson

\- `reviewed\_by`: Person who reviewed the lesson

\- `approved\_by`: Person authorizing reuse of the lesson

\- `created\_at`: Record creation timestamp

\- `updated\_at`: Most recent update timestamp



\### Allowed Lesson Types



\- `ADVANCE\_ACCURACY`

\- `VENUE\_LIMITATION`

\- `DOCUMENT\_ERROR`

\- `COMMUNICATION\_FAILURE`

\- `SCHEDULE\_VARIANCE`

\- `LABOR\_VARIANCE`

\- `TECHNICAL\_FAILURE`

\- `SAFETY\_OBSERVATION`

\- `SUCCESSFUL\_WORKAROUND`

\- `VENDOR\_PERFORMANCE`

\- `PROCESS\_IMPROVEMENT`

\- `OTHER`



\### Allowed Lesson Status Values



\- `DRAFT`

\- `UNDER\_REVIEW`

\- `APPROVED`

\- `REJECTED`

\- `RESTRICTED`

\- `ARCHIVED`



\### Core Post-Show Lesson Rule



A lesson must distinguish verified facts from personal opinion. RIGOR may use only approved lessons as future operational intelligence, and sensitive personnel information must remain restricted.





\## Entity Relationships



The RIGOR schema uses the Show record as the central operational container.



\### Primary Relationships



\- One `SHOW` may contain many `DOCUMENTS`.

\- One `SHOW` may contain many `REQUIREMENTS`.

\- One `SHOW` may contain many `CONFLICTS`.

\- One `SHOW` may contain many `RISKS`.

\- One `SHOW` may contain many `ADVANCE\_QUESTIONS`.

\- One `SHOW` may contain many `RESPONSES`.

\- One `SHOW` may contain many `DECISIONS`.

\- One `SHOW` may contain many `CONTACTS`.

\- One `SHOW` may contain many `AUDIT\_EVENTS`.

\- One `SHOW` may contain many `POST\_SHOW\_LESSONS`.



\### Evidence Relationships



\- One `DOCUMENT` may support many `REQUIREMENTS`.

\- One `REQUIREMENT` may reference one primary document and additional supporting documents.

\- One `CONFLICT` must reference two or more incompatible requirements or sources.

\- One `RISK` may reference requirements, conflicts, documents, or post-show lessons.

\- One `ADVANCE\_QUESTION` may reference requirements, conflicts, risks, and documents.

\- One `RESPONSE` must reference one Advance Question.

\- One `DECISION` may reference requirements, conflicts, risks, questions, responses, and documents.

\- One `POST\_SHOW\_LESSON` may reference any operational records involved in the lesson.



\### History Relationships



\- A revised `DOCUMENT` may supersede an earlier document.

\- A revised `DECISION` may supersede an earlier decision.

\- A changed `REQUIREMENT` must preserve the earlier requirement history.

\- Every significant record change must create an `AUDIT\_EVENT`.



\### Core Relationship Rule



Deleting or replacing a record must never break its evidence chain. Historical records must remain traceable even when newer records supersede them.





\## Global Data Standards



These standards apply to every RIGOR record.



\### Identifiers



\- Every primary identifier must be unique.

\- Identifiers must be generated by the system.

\- Identifiers must never be reused after deletion or archival.

\- Related records must reference identifiers rather than names alone.



\### Dates and Times



\- All stored timestamps must use ISO 8601 format.

\- Every timestamp must include a timezone or UTC offset.

\- Venue schedules must preserve the venue's local timezone.

\- Displayed times may be converted for the user, but stored source times must remain unchanged.



\### Text and Values



\- Source wording must be preserved separately from normalized values.

\- Measurements must store both the numeric value and unit.

\- Unknown values must remain empty or use an approved status; they must not be guessed.

\- AI summaries must never replace source excerpts.

\- Sensitive information must be marked for restricted access.



\### Confidence



\- Confidence must use a value from `0.00` to `1.00`.

\- Confidence measures extraction certainty, not operational safety.

\- Low-confidence information must be routed for human review.

\- Human approval must not erase the original AI confidence value.



\### Record History



\- Records must use `created\_at` and `updated\_at` timestamps.

\- Significant changes must create an `AUDIT\_EVENT`.

\- Superseded records must remain readable.

\- Historical evidence must not be silently altered.



\### Core Data Standard Rule



RIGOR must preserve the difference between what a source stated, how the system normalized it, what the AI inferred, and what an authorized human approved.







\## Department Taxonomy



RIGOR uses standardized department names so requirements, risks, conflicts, questions, and decisions can be compared consistently.



\### Allowed Department Values



\- `PRODUCTION\_MANAGEMENT`

\- `VENUE\_OPERATIONS`

\- `SITE\_OPERATIONS`

\- `STAGING`

\- `RIGGING`

\- `POWER`

\- `AUDIO`

\- `LIGHTING`

\- `VIDEO`

\- `LED`

\- `CAMERAS`

\- `BROADCAST`

\- `NETWORKING`

\- `COMMUNICATIONS`

\- `LABOR`

\- `LOGISTICS`

\- `TRANSPORTATION`

\- `SECURITY`

\- `MEDICAL`

\- `ARTIST\_SERVICES`

\- `HOSPITALITY`

\- `CATERING`

\- `MERCHANDISE`

\- `TICKETING`

\- `SETTLEMENT`

\- `OTHER`



\### Department Assignment Rules



\- Every operational record must identify one primary department.

\- Records affecting multiple departments may include additional department references.

\- Department names from source documents must be preserved in the source text.

\- Source department names must be mapped to an approved standardized value.

\- `OTHER` may be used only when no approved department value applies.

\- New department values require documented schema review.



\### Core Department Rule



Standardization must not erase the language used by the original source. RIGOR must preserve both the source department label and its normalized department value.









\## Operational Category Taxonomy



Categories describe the specific operational subject within a department.



\### Allowed Category Values



\- `SCHEDULE`

\- `LOAD\_IN`

\- `LOAD\_OUT`

\- `ACCESS`

\- `PARKING`

\- `DOCK`

\- `STAGE\_DIMENSIONS`

\- `STAGE\_LOADING`

\- `RIGGING\_CAPACITY`

\- `RIGGING\_POINTS`

\- `POWER\_CAPACITY`

\- `POWER\_CONNECTION`

\- `GROUNDING`

\- `AUDIO\_SYSTEM`

\- `AUDIO\_INPUTS`

\- `AUDIO\_OUTPUTS`

\- `RF\_COORDINATION`

\- `LIGHTING\_SYSTEM`

\- `LIGHTING\_CONTROL`

\- `VIDEO\_SYSTEM`

\- `LED\_WALL`

\- `VIDEO\_SIGNAL`

\- `CAMERA\_SYSTEM`

\- `CAMERA\_POSITIONS`

\- `BROADCAST\_SIGNAL`

\- `NETWORK`

\- `COMMS`

\- `LABOR\_CALL`

\- `CREWING`

\- `EQUIPMENT`

\- `TRANSPORTATION`

\- `SECURITY`

\- `MEDICAL`

\- `HOSPITALITY`

\- `CATERING`

\- `MERCHANDISE`

\- `TICKETING`

\- `SETTLEMENT`

\- `CONTACT\_INFORMATION`

\- `DOCUMENT\_REVISION`

\- `SAFETY`

\- `OTHER`



\### Category Assignment Rules



\- Every operational record must identify one primary category.

\- Categories must be used with a normalized department value.

\- Source terminology must remain preserved separately.

\- Multiple categories may be linked when one issue has several operational effects.

\- `OTHER` may be used only when no approved category applies.

\- New categories require documented schema review.



\### Core Category Rule



RIGOR must use categories consistently enough to compare requirements across documents, revisions, venues, and completed shows without losing the original source wording.







\## Schema Validation Rules



RIGOR must validate records before they are treated as complete, confirmed, approved, or show-ready.



\### Show Validation



A Show record must not become `SHOW\_READY` unless:



\- The venue, city, country, timezone, and show date are confirmed.

\- Load-in, doors, show, and curfew times are confirmed or marked not applicable.

\- Critical departments have completed review.

\- No unresolved `CRITICAL` conflicts remain.

\- No unresolved `CRITICAL` risks remain.

\- Required show-critical contacts are verified.

\- All accepted risks have human approval.



\### Document Validation



A Document record must not become `PROCESSED` unless:



\- The file can be opened or the message can be read.

\- The document type has been assigned.

\- The source party is recorded when known.

\- The revision and document date are captured when available.

\- Extracted information remains connected to the document.

\- Processing failures are recorded rather than ignored.



\### Requirement Validation



A Requirement must not become `CONFIRMED` unless:



\- The requirement is linked to traceable evidence or authorized human confirmation.

\- The department and category are assigned.

\- Source wording is preserved.

\- Normalized values include units when applicable.

\- Conflicting values have been evaluated.

\- AI inference is not represented as source-confirmed fact.



\### Conflict Validation



A Conflict must not become `RESOLVED` unless:



\- All conflicting requirements or sources remain linked.

\- The approved resolution is recorded.

\- The resolver is identified.

\- The resolution timestamp is stored.

\- A Decision record is created when operational approval is required.



\### Risk Validation



A Risk must not become `CLOSED` unless:



\- The mitigation, acceptance, or resolution is documented.

\- The responsible owner is identified.

\- Safety-critical classifications receive human review.

\- Accepted risks identify the approving person.

\- Supporting evidence remains traceable.



\### Question and Response Validation



An Advance Question must not become `CLOSED` unless:



\- A response is received, the question is cancelled, or an authorized person closes it.

\- The operational effect of the response is recorded.

\- Follow-up requirements are created when the response is incomplete.

\- Any new conflict or risk discovered from the response is stored separately.



\### Decision Validation



A Decision must not become `ACTIVE` unless:



\- The approving person is identified.

\- The approval timestamp is stored.

\- The supporting records remain linked.

\- Any decision being replaced is marked `SUPERSEDED`.

\- The decision does not silently alter historical evidence.



\### Core Validation Rule



RIGOR must fail safely. When required evidence, approval, or information is missing, the record must remain incomplete or `NEEDS\_CONFIRMATION` rather than being guessed, promoted, or silently accepted.





\## Entity 12: Show Readiness Snapshot



A Show Readiness Snapshot records RIGOR's assessment of operational readiness at a specific point in time.



Snapshots preserve how readiness changed as documents, confirmations, conflicts, risks, questions, and approvals were updated.



\### Required Fields



\- `readiness\_snapshot\_id`: Unique system-generated identifier

\- `show\_id`: Show being evaluated

\- `calculated\_at`: Exact calculation timestamp

\- `overall\_score`: Readiness score from 0 to 100

\- `readiness\_status`: Current readiness classification

\- `document\_score`: Document completion score

\- `requirement\_score`: Requirement confirmation score

\- `conflict\_score`: Conflict resolution score

\- `risk\_score`: Risk handling score

\- `question\_score`: Advance Question completion score

\- `contact\_score`: Contact verification score

\- `department\_review\_score`: Department review completion score

\- `critical\_conflict\_count`: Number of unresolved critical conflicts

\- `critical\_risk\_count`: Number of unresolved critical risks

\- `high\_conflict\_count`: Number of unresolved high conflicts

\- `high\_risk\_count`: Number of unresolved high risks

\- `open\_question\_count`: Number of open Advance Questions

\- `unverified\_contact\_count`: Number of required unverified contacts

\- `missing\_required\_field\_count`: Number of required show fields still missing

\- `blocking\_reasons`: Conditions preventing show-ready approval

\- `calculation\_version`: Version of the scoring rules used

\- `human\_review\_status`: Current human review state

\- `reviewed\_by`: Person reviewing the snapshot

\- `reviewed\_at`: Review timestamp

\- `created\_at`: Record creation timestamp



\### Readiness Score Weights



\- Documents processed: 15 points

\- Requirements confirmed: 25 points

\- Conflicts resolved: 20 points

\- Risks mitigated or approved: 20 points

\- Advance Questions completed: 10 points

\- Required contacts verified: 5 points

\- Department reviews completed: 5 points



Total possible score: 100 points.



\### Allowed Readiness Status Values



\- `NOT\_STARTED`

\- `EARLY\_REVIEW`

\- `ADVANCE\_IN\_PROGRESS`

\- `AT\_RISK`

\- `NEAR\_READY`

\- `SHOW\_READY`

\- `BLOCKED`

\- `SHOW\_COMPLETE`



\### Allowed Human Review Status Values



\- `NOT\_REVIEWED`

\- `REVIEW\_REQUIRED`

\- `UNDER\_REVIEW`

\- `APPROVED`

\- `REJECTED`



\### Hard Blocking Conditions



A show must not receive `SHOW\_READY` status when any of the following exists:



\- One or more unresolved `CRITICAL` conflicts

\- One or more unresolved `CRITICAL` risks

\- Missing venue identity or local timezone

\- Missing show date or show time

\- Missing load-in time unless marked not applicable

\- Missing required emergency or venue production contact

\- Unapproved accepted safety risk

\- Incomplete critical department review

\- A failed source document required for operational execution



\### Core Readiness Rule



A high numerical score must never override a hard blocking condition. RIGOR may calculate readiness automatically, but final `SHOW\_READY` approval must remain traceable to an authorized human.







\## Schema Version Control



The RIGOR schema must be versioned so database changes, AI behavior, reports, and historical show records remain compatible.



\### Current Version



\- `schema\_name`: RIGOR Core Schema

\- `schema\_version`: 0.1

\- `schema\_status`: DRAFT

\- `compatibility\_level`: DEVELOPMENT

\- `change\_type`: INITIAL\_DEFINITION



\### Allowed Schema Status Values



\- `DRAFT`

\- `UNDER\_REVIEW`

\- `APPROVED`

\- `ACTIVE`

\- `DEPRECATED`

\- `ARCHIVED`



\### Allowed Change Types



\- `INITIAL\_DEFINITION`

\- `FIELD\_ADDITION`

\- `FIELD\_MODIFICATION`

\- `FIELD\_DEPRECATION`

\- `STATUS\_ADDITION`

\- `RELATIONSHIP\_CHANGE`

\- `VALIDATION\_CHANGE`

\- `SECURITY\_CHANGE`

\- `BREAKING\_CHANGE`



\### Versioning Rules



\- Every schema revision must receive a new version number.

\- Existing field meanings must not be silently changed.

\- Removed fields must first be marked deprecated.

\- Breaking changes require a migration plan.

\- Historical records must retain the schema version under which they were created.

\- Readiness calculations must preserve their calculation version.

\- AI extraction and validation outputs must identify the schema version used.



\### Core Version Rule



A schema update must never make historical show records uninterpretable. RIGOR must preserve both the original record structure and the migration history used to update it.





\## Core Schema v0.1 Completion



RIGOR Core Schema v0.1 now defines:



\- Show records

\- Source documents

\- Operational requirements

\- Conflicts

\- Risks

\- Advance Questions

\- Responses

\- Decisions

\- Audit events

\- Contacts

\- Post-show lessons

\- Show readiness snapshots

\- Entity relationships

\- Department and category taxonomies

\- Validation rules

\- Data standards

\- Version control



\### Next Development Phase



The next phase converts this specification into executable database tables, constraints, relationships, validation logic, and migrations.



\### Completion Status



\- `schema\_version`: 0.1

\- `schema\_status`: DRAFT

\- `documentation\_status`: COMPLETE

\- `next\_phase`: DATABASE\_IMPLEMENTATION

















