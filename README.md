# ReapMind HR Operations System
Internal web application for resume intake, candidate tracking, interview feedback, and documentation tracking.

Developed for **ReapMind Innovations Pvt. Ltd., Kolhapur** according to Software Requirements Document (SRD v1.0).

---

## 🚀 Key Features Implemented (Phase 1 MVP)

1. **Candidate Intake Under 1 Minute:**
   - Single-screen Front Desk intake: Full Name, 10-digit Indian Mobile, Email, Position Applied, Source, Remarks, and DPDP Consent Checkbox.
   - Dual Resume Options: Drag-and-drop file upload (PDF/DOCX/JPG/PNG up to 10 MB) OR in-browser multi-page camera scan (laptop webcam or mobile camera) with Rotate 90°, Retake, Preview, and automated PDF merge via `pdf-lib`.
   - Sequential unique Candidate ID format: `RM-CAN-000101`.
   - Real-time duplicate check with option to proceed with re-application reason.

2. **Sub-10s Real-Time Broadcast:**
   - Server-Sent Events (SSE) live push to dashboards of HR, Directors, and CEO without refreshing.
   - Real-time in-app notification bell with unread badge counter.

3. **Interviewer Assignment Engine:**
   - Dynamic assignment dropdown linked to active user accounts (*Aayushi, Hema, Mahwash, Aroof*).
   - Instant notification dispatched to the assigned interviewer.
   - Immutable assignment history trail on the candidate profile.

4. **Candidate Profile & Embedded Resume Viewer:**
   - Wireframe layout conforming to SRD Section 6: Top candidate summary, immediately followed by the embedded document/resume viewer (with zoom, rotate, download buttons).
   - Multi-page camera capture gallery support.

5. **Tamper-Proof Interview Feedback:**
   - Author name automatically populated from authenticated session (cannot be faked).
   - 1–5 star rating, recommendation (*Select, Hold, Reject, Next round*), mandatory comments ($\ge 20$ characters), strengths, concerns, CTC, and notice period.
   - **Zero Deletion:** Reviews cannot be deleted by anyone, including Admins.
   - **15-Minute Edit Grace Period:** Edits within 15 minutes are versioned; edits beyond 15 minutes are appended as dated addendums.
   - Front Desk role strictly blocked from viewing interview feedback.

6. **Administration & Audit Trail:**
   - User & role management (create user, change role, deactivate user while preserving history).
   - Master list manager (positions, sources, statuses, rounds).
   - Append-only audit log tracking every login, resume view, download, assignment, and status change.


## 🛠️ How to Run Locally

### 1. Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Run in Production Mode
```bash
npm run build
npm start
```

### 3. Run Acceptance Verification Tests
```bash
node scripts/test-acceptance.js
```
