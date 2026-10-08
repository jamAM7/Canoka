"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import styles from "./sign-up.module.css";

const steps = ["Account", "Learning style", "Your notes", "Ready"];

const learningModes = [
  { id: "examples", label: "Worked examples", detail: "See an idea applied before the theory" },
  { id: "visual", label: "Visual structure", detail: "Diagrams, relationships and clear hierarchy" },
  { id: "explanations", label: "Plain explanations", detail: "Build from first principles in simple language" },
  { id: "practice", label: "Active recall", detail: "Questions and practice to make ideas stick" },
];

const noteDepths = [
  { id: "concise", label: "Quick scan", detail: "Short summaries and key points" },
  { id: "balanced", label: "Balanced", detail: "Explanation with useful detail" },
  { id: "detailed", label: "Deep study", detail: "Thorough context and connections" },
];

const supportStyles = [
  { id: "guided", label: "Guide me step by step" },
  { id: "questions", label: "Ask me questions first" },
  { id: "direct", label: "Explain it clearly straight away" },
];

function Logo() {
  return (
    <div className={styles.logo} aria-label="Canoka">
      <span className={styles.logoPlaceholder} aria-hidden="true">Logo</span>
      <span>Canoka</span>
    </div>
  );
}

function ArrowIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12m-4-4 4 4-4 4" /></svg>;
}

export default function SignUpPage() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<"sign-up" | "sign-in">("sign-up");
  const [step, setStep] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [studyLevel, setStudyLevel] = useState("");
  const [studyGoal, setStudyGoal] = useState("");
  const [selectedModes, setSelectedModes] = useState<string[]>([]);
  const [noteDepth, setNoteDepth] = useState("balanced");
  const [supportStyle, setSupportStyle] = useState("guided");
  const [error, setError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [confirmationRequired, setConfirmationRequired] = useState(false);

  const firstName = useMemo(() => name.trim().split(/\s+/)[0] || "there", [name]);

  function nextFromAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !email.trim() || password.length < 8) {
      setError("Add your name, a valid email, and a password with at least 8 characters.");
      return;
    }
    setError("");
    setStep(1);
  }

  function nextFromLearningStyle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studyLevel || !studyGoal || selectedModes.length === 0) {
      setError("Choose your study level, main goal, and at least one way you learn best.");
      return;
    }
    setError("");
    setStep(2);
  }

  async function finishSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setError("");
    try {
      if (!isSupabaseConfigured()) throw new Error("Supabase needs a project URL and publishable key in .env before accounts can be created.");
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
          data: {
            full_name: name.trim(),
            study_level: studyLevel,
            study_goal: studyGoal,
            learning_modes: selectedModes,
            note_depth: noteDepth,
            support_style: supportStyle,
          },
        },
      });
      if (signUpError) throw signUpError;
      setConfirmationRequired(!data.session);
      setStep(3);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Could not create your account.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setError("");
    try {
      if (!email.trim() || !password) throw new Error("Enter your email address and password.");
      if (!isSupabaseConfigured()) throw new Error("Supabase needs a project URL and publishable key in .env before you can sign in.");
      const { error: signInError } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw signInError;
      router.replace("/dashboard");
      router.refresh();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Could not sign in.");
    } finally {
      setAuthBusy(false);
    }
  }

  function switchMode() {
    setAuthMode((current) => current === "sign-up" ? "sign-in" : "sign-up");
    setError("");
    setStep(0);
  }

  function toggleMode(mode: string) {
    setSelectedModes((current) =>
      current.includes(mode) ? current.filter((item) => item !== mode) : [...current, mode],
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.authHeader}>
        <Logo />
        <div className={styles.authSwitch}>
          <span>{authMode === "sign-up" ? "Already have an account?" : "New to Canoka?"}</span>
          <button type="button" onClick={switchMode}>{authMode === "sign-up" ? "Sign in" : "Create account"}</button>
        </div>
      </header>

      <section className={styles.formPanel}>
        <div className={styles.formShell}>
          {authMode === "sign-up" && <nav className={styles.stepper} aria-label="Account setup progress">
            {steps.map((label, index) => (
              <div className={`${styles.step} ${index <= step ? styles.stepActive : ""}`} key={label}>
                <span>{index < step ? "✓" : index + 1}</span><small>{label}</small>
                {index < steps.length - 1 && <i />}
              </div>
            ))}
          </nav>}

          {authMode === "sign-in" && (
            <div className={styles.stepContent}>
              <div className={styles.heading}>
                <h2>Sign in</h2>
                <p>Use the email and password linked to your Canoka account.</p>
              </div>
              <form onSubmit={signIn}>
                <label className={styles.field}><span>Email address</span><input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@university.edu" type="email" autoComplete="email" /></label>
                <label className={styles.field}>
                  <span>Password</span>
                  <div className={styles.passwordWrap}>
                    <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" type={showPassword ? "text" : "password"} autoComplete="current-password" />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
                  </div>
                </label>
                {error && <p className={styles.error} role="alert">{error}</p>}
                <button className={styles.primaryButton} type="submit" disabled={authBusy}>{authBusy ? "Signing in…" : "Sign in"} {!authBusy && <ArrowIcon />}</button>
              </form>
            </div>
          )}

          {authMode === "sign-up" && step === 0 && (
            <div className={styles.stepContent}>
              <div className={styles.heading}>
                <h2>Create your account</h2>
                <p>Use your student details to set up Canoka.</p>
              </div>
              <form onSubmit={nextFromAccount} noValidate>
                <label className={styles.field}><span>Your name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Alex Morgan" autoComplete="name" /></label>
                <label className={styles.field}><span>Email address</span><input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@university.edu" type="email" autoComplete="email" /></label>
                <label className={styles.field}>
                  <span>Create a password</span>
                  <div className={styles.passwordWrap}>
                    <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" type={showPassword ? "text" : "password"} autoComplete="new-password" />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
                  </div>
                </label>
                {error && <p className={styles.error} role="alert">{error}</p>}
                <button className={styles.primaryButton} type="submit">Continue <ArrowIcon /></button>
              </form>
            </div>
          )}

          {authMode === "sign-up" && step === 1 && (
            <div className={styles.stepContent}>
              <div className={styles.heading}>
                <h2>How do you learn best?</h2>
                <p>Choose the approaches you find most useful.</p>
              </div>
              <form onSubmit={nextFromLearningStyle}>
                <div className={styles.twoFields}>
                  <label className={styles.field}>
                    <span>Current study level</span>
                    <select value={studyLevel} onChange={(event) => setStudyLevel(event.target.value)}>
                      <option value="">Select level</option><option value="high-school">High school</option><option value="undergraduate">Undergraduate</option><option value="postgraduate">Postgraduate</option><option value="other">Other</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Your main goal</span>
                    <select value={studyGoal} onChange={(event) => setStudyGoal(event.target.value)}>
                      <option value="">Select goal</option><option value="understand">Understand topics deeply</option><option value="exams">Prepare for exams</option><option value="assignments">Complete assignments</option><option value="keep-up">Keep up each week</option>
                    </select>
                  </label>
                </div>
                <fieldset className={styles.subjectFieldset}>
                  <legend>What helps ideas make sense? <small>Choose all that apply</small></legend>
                  <div className={styles.subjectGrid}>
                    {learningModes.map((mode, index) => {
                      const selected = selectedModes.includes(mode.id);
                      return <button className={selected ? styles.subjectSelected : ""} type="button" aria-pressed={selected} onClick={() => toggleMode(mode.id)} key={mode.id}><span>{String(index + 1).padStart(2, "0")}</span><p><b>{mode.label}</b><small>{mode.detail}</small></p><i>{selected ? "✓" : "+"}</i></button>;
                    })}
                  </div>
                </fieldset>
                {error && <p className={styles.error} role="alert">{error}</p>}
                <div className={styles.actions}>
                  <button className={styles.backButton} type="button" onClick={() => { setError(""); setStep(0); }}>Back</button>
                  <button className={styles.primaryButton} type="submit">Continue <ArrowIcon /></button>
                </div>
              </form>
            </div>
          )}

          {authMode === "sign-up" && step === 2 && (
            <div className={styles.stepContent}>
              <div className={styles.heading}>
                <h2>Shape your note reviews</h2>
                <p>Set the amount of detail and type of support you want.</p>
              </div>
              <form onSubmit={finishSetup}>
                <fieldset className={styles.choiceFieldset}>
                  <legend>How detailed should explanations be?</legend>
                  <div className={styles.segmentedChoices}>
                    {noteDepths.map((depth) => <label className={noteDepth === depth.id ? styles.choiceSelected : ""} key={depth.id}><input type="radio" name="note-depth" value={depth.id} checked={noteDepth === depth.id} onChange={(event) => setNoteDepth(event.target.value)} /><b>{depth.label}</b><small>{depth.detail}</small></label>)}
                  </div>
                </fieldset>
                <fieldset className={styles.choiceFieldset}>
                  <legend>When something is missing or unclear...</legend>
                  <div className={styles.radioList}>
                    {supportStyles.map((support) => <label className={supportStyle === support.id ? styles.radioSelected : ""} key={support.id}><input type="radio" name="support-style" value={support.id} checked={supportStyle === support.id} onChange={(event) => setSupportStyle(event.target.value)} /><span>{support.label}</span><i /></label>)}
                  </div>
                </fieldset>
                <p className={styles.preferenceNote}>Canoka will use these preferences when reviewing your weekly notes. They&apos;re saved privately on this device.</p>
                <div className={styles.actions}>
                  <button className={styles.backButton} type="button" onClick={() => setStep(1)}>Back</button>
                  <button className={styles.primaryButton} type="submit" disabled={authBusy}>{authBusy ? "Creating account…" : "Create account"} {!authBusy && <ArrowIcon />}</button>
                </div>
              </form>
            </div>
          )}

          {authMode === "sign-up" && step === 3 && (
            <div className={`${styles.stepContent} ${styles.complete}`}>
              <div className={styles.successMark} aria-hidden="true"><span>✓</span></div>
              <h2>{confirmationRequired ? "Check your email" : <>Welcome to Canoka,<br />{firstName}!</>}</h2>
              <p>{confirmationRequired ? `We sent a confirmation link to ${email.trim()}. Open it before signing in.` : "Your account and learning preferences are ready."}</p>
              <div className={styles.readyList}>
                <div><span>01</span><p><b>Your workspace is ready</b><small>Classes, notes and tasks in one place</small></p><i>✓</i></div>
                <div><span>02</span><p><b>Your learning profile is saved</b><small>Note reviews will adapt to how you learn</small></p><i>✓</i></div>
              </div>
              <button className={styles.primaryButton} type="button" onClick={() => confirmationRequired ? switchMode() : router.push("/dashboard")}>{confirmationRequired ? "Go to sign in" : "Open dashboard"} <ArrowIcon /></button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
