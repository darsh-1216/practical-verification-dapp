import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";

const TARGET_CHAIN_ID = 11155111;
const TARGET_CHAIN_HEX = "0xaa36a7";

const CONFIG = window.__QUICK_DAPP_CONFIG__ || {};
const CONTRACTS = CONFIG.contracts || [];
const PRIMARY_CONTRACT_ID = CONFIG.primaryContractId || null;

const shortAddr = (address) =>
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "—";

const formatTime = (timestamp) => {
  if (!timestamp) return "—";

  try {
    return new Date(Number(timestamp) * 1000).toLocaleString();
  } catch {
    return "—";
  }
};

const getProvider = () => {
  if (window.__qdapp_getProvider) {
    return window.__qdapp_getProvider();
  }

  if (window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }

  return null;
};

const getContractConfig = () => {
  let config = null;

  if (PRIMARY_CONTRACT_ID) {
    config = CONTRACTS.find((item) => item.id === PRIMARY_CONTRACT_ID);
  }

  if (!config && CONTRACTS.length > 0) {
    config = CONTRACTS[0];
  }

  return config;
};

const getContractAddress = () => {
  const config = getContractConfig();

  if (!config) return "";

  return (
    config.address ||
    config.contractAddress ||
    config.deployment?.address ||
    ""
  );
};

const getContractABI = () => {
  const config = getContractConfig();

  if (!config) return [];

  return config.abi || config.contractAbi || config.deployment?.abi || [];
};

function StatusBadge({ children, type = "default" }) {
  return <span className={`status-badge status-${type}`}>{children}</span>;
}

function Spinner() {
  return <span className="spinner" />;
}

function App() {
  const contractAddress = getContractAddress();
  const contractABI = getContractABI();

  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);

  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);

  const [role, setRole] = useState(null);
  const [professorAddress, setProfessorAddress] = useState("");

  const [student, setStudent] = useState(null);
  const [practicals, setPracticals] = useState([]);

  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);

  const [activePage, setActivePage] = useState("overview");

  const [toast, setToast] = useState(null);

  const [studentWalletInput, setStudentWalletInput] = useState("");
  const [lookupStudent, setLookupStudent] = useState(null);

  const [reviewWallet, setReviewWallet] = useState("");
  const [reviewStudent, setReviewStudent] = useState(null);
  const [reviewPracticals, setReviewPracticals] = useState([]);

  const [form, setForm] = useState({
    name: "",
    enrollmentNo: "",
    title: "",
    submissionHash: "",
  });

  const showToast = (message, type = "success") => {
    setToast({ message, type });

    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  const resetDashboardState = () => {
    setRole(null);
    setProfessorAddress("");
    setStudent(null);
    setPracticals([]);
    setLookupStudent(null);
    setReviewStudent(null);
    setReviewPracticals([]);
    setActivePage("overview");
  };

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        showToast("Please install MetaMask first.", "error");
        return;
      }

      setLoading(true);

      const browserProvider = new ethers.BrowserProvider(window.ethereum);

      await browserProvider.send("eth_requestAccounts", []);

      const network = await browserProvider.getNetwork();
      const currentChainId = Number(network.chainId);

      if (currentChainId !== TARGET_CHAIN_ID) {
        showToast("Please switch MetaMask to Ethereum Sepolia.", "error");
        setLoading(false);
        return;
      }

      const currentSigner = await browserProvider.getSigner();
      const address = await currentSigner.getAddress();

      setProvider(browserProvider);
      setSigner(currentSigner);
      setAccount(address);
      setChainId(currentChainId);

      if (!contractAddress || !contractABI.length) {
        showToast(
          "Contract configuration is missing. Add your deployed contract in Remix.",
          "error"
        );
        setLoading(false);
        return;
      }

      const currentContract = new ethers.Contract(
        contractAddress,
        contractABI,
        currentSigner
      );

      setContract(currentContract);

      const professor = await currentContract.professor();

      setProfessorAddress(professor);

      if (address.toLowerCase() === professor.toLowerCase()) {
        setRole("professor");
        setActivePage("overview");
      } else {
        setRole("student");
        setActivePage("overview");
      }

      showToast("Wallet connected successfully.");

      await loadStudentData(currentContract, address);
    } catch (error) {
      console.error(error);

      showToast(
        error?.reason ||
          error?.shortMessage ||
          error?.message ||
          "Failed to connect wallet.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const loadStudentData = async (currentContract = contract, address = account) => {
    if (!currentContract || !address) return;

    try {
      const result = await currentContract.getStudent(address);

      const studentData = {
        name: result[0] || "",
        enrollmentNo: result[1] || "",
        registered: Boolean(result[2]),
        verified: Boolean(result[3]),
      };

      setStudent(studentData);

      if (studentData.registered) {
        const count = Number(
          await currentContract.getPracticalCount(address)
        );

        const list = [];

        for (let i = 0; i < count; i++) {
          const practical = await currentContract.getPractical(address, i);

          list.push({
            index: i,
            title: practical[0],
            submissionHash: practical[1],
            submissionTime: practical[2],
            status: practical[3],
          });
        }

        setPracticals(list);
      } else {
        setPracticals([]);
      }
    } catch (error) {
      console.error("Student data error:", error);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    if (!contract || !account) {
      showToast("Connect your wallet first.", "error");
      return;
    }

    if (!form.name.trim() || !form.enrollmentNo.trim()) {
      showToast("Please enter name and enrollment number.", "error");
      return;
    }

    try {
      setLoading(true);

      const tx = await contract.registerStudent(
        form.name.trim(),
        form.enrollmentNo.trim()
      );

      showToast("Registration transaction submitted.");

      await tx.wait();

      showToast("Student registered successfully.");

      await loadStudentData();
    } catch (error) {
      console.error(error);

      showToast(
        error?.reason ||
          error?.shortMessage ||
          error?.message ||
          "Registration failed.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPractical = async (e) => {
    e.preventDefault();

    if (!contract || !account) {
      showToast("Connect your wallet first.", "error");
      return;
    }

    if (!student?.registered) {
      showToast("Please register first.", "error");
      return;
    }

    if (!student?.verified) {
      showToast("Your identity must be verified by the professor first.", "error");
      return;
    }

    if (!form.title.trim() || !form.submissionHash.trim()) {
      showToast("Please enter practical title and submission hash.", "error");
      return;
    }

    try {
      setLoading(true);

      const tx = await contract.submitPractical(
        form.title.trim(),
        form.submissionHash.trim()
      );

      showToast("Submission transaction sent.");

      await tx.wait();

      showToast("Practical submitted successfully.");

      setForm((prev) => ({
        ...prev,
        title: "",
        submissionHash: "",
      }));

      await loadStudentData();
    } catch (error) {
      console.error(error);

      showToast(
        error?.reason ||
          error?.shortMessage ||
          error?.message ||
          "Practical submission failed.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyStudent = async () => {
    if (!contract) {
      showToast("Contract is not connected.", "error");
      return;
    }

    if (!ethers.isAddress(studentWalletInput)) {
      showToast("Enter a valid wallet address.", "error");
      return;
    }

    try {
      setLoading(true);

      const tx = await contract.verifyStudent(studentWalletInput);

      showToast("Verification transaction submitted.");

      await tx.wait();

      showToast("Student verified successfully.");

      await lookupStudentInfo();
    } catch (error) {
      console.error(error);

      showToast(
        error?.reason ||
          error?.shortMessage ||
          error?.message ||
          "Verification failed.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const lookupStudentInfo = async () => {
    if (!contract) return;

    if (!ethers.isAddress(studentWalletInput)) {
      showToast("Enter a valid wallet address.", "error");
      return;
    }

    try {
      setLoading(true);

      const result = await contract.getStudent(studentWalletInput);

      setLookupStudent({
        address: studentWalletInput,
        name: result[0] || "",
        enrollmentNo: result[1] || "",
        registered: Boolean(result[2]),
        verified: Boolean(result[3]),
      });
    } catch (error) {
      console.error(error);

      showToast("Unable to find student information.", "error");
    } finally {
      setLoading(false);
    }
  };

  const lookupPracticals = async () => {
    if (!contract) return;

    if (!ethers.isAddress(reviewWallet)) {
      showToast("Enter a valid student wallet address.", "error");
      return;
    }

    try {
      setLoading(true);

      const result = await contract.getStudent(reviewWallet);

      const studentData = {
        address: reviewWallet,
        name: result[0] || "",
        enrollmentNo: result[1] || "",
        registered: Boolean(result[2]),
        verified: Boolean(result[3]),
      };

      setReviewStudent(studentData);

      if (!studentData.registered) {
        setReviewPracticals([]);
        return;
      }

      const count = Number(
        await contract.getPracticalCount(reviewWallet)
      );

      const list = [];

      for (let i = 0; i < count; i++) {
        const practical = await contract.getPractical(reviewWallet, i);

        list.push({
          index: i,
          title: practical[0],
          submissionHash: practical[1],
          submissionTime: practical[2],
          status: practical[3],
        });
      }

      setReviewPracticals(list);
    } catch (error) {
      console.error(error);

      showToast("Unable to load student's practicals.", "error");
    } finally {
      setLoading(false);
    }
  };

  const updatePracticalStatus = async (index, approved) => {
    if (!contract || !reviewStudent) return;

    try {
      setLoading(true);

      const tx = approved
        ? await contract.approvePractical(reviewStudent.address, index)
        : await contract.rejectPractical(reviewStudent.address, index);

      showToast(
        approved
          ? "Approval transaction submitted."
          : "Rejection transaction submitted."
      );

      await tx.wait();

      showToast(
        approved
          ? "Practical approved successfully."
          : "Practical rejected successfully."
      );

      await lookupPracticals();
    } catch (error) {
      console.error(error);

      showToast(
        error?.reason ||
          error?.shortMessage ||
          error?.message ||
          "Unable to update practical status.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (!accounts.length) {
        setAccount("");
        setSigner(null);
        setProvider(null);
        setContract(null);
        resetDashboardState();
        return;
      }

      window.location.reload();
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener(
        "accountsChanged",
        handleAccountsChanged
      );

      window.ethereum.removeListener(
        "chainChanged",
        handleChainChanged
      );
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      if (!window.ethereum) return;

      try {
        setInitializing(true);

        const accounts = await window.ethereum.request({
          method: "eth_accounts",
        });

        if (!accounts.length) return;

        const browserProvider = new ethers.BrowserProvider(window.ethereum);
        const network = await browserProvider.getNetwork();

        const currentChainId = Number(network.chainId);

        if (currentChainId !== TARGET_CHAIN_ID) {
          setAccount(accounts[0]);
          setChainId(currentChainId);
          return;
        }

        const currentSigner = await browserProvider.getSigner();
        const address = await currentSigner.getAddress();

        setProvider(browserProvider);
        setSigner(currentSigner);
        setAccount(address);
        setChainId(currentChainId);

        if (!contractAddress || !contractABI.length) return;

        const currentContract = new ethers.Contract(
          contractAddress,
          contractABI,
          currentSigner
        );

        setContract(currentContract);

        const professor = await currentContract.professor();

        setProfessorAddress(professor);

        if (address.toLowerCase() === professor.toLowerCase()) {
          setRole("professor");
        } else {
          setRole("student");
        }

        await loadStudentData(currentContract, address);
      } catch (error) {
        console.error("Initialization error:", error);
      } finally {
        setInitializing(false);
      }
    };

    init();
  }, []);

  const isCorrectNetwork = chainId === TARGET_CHAIN_ID;

  const studentStats = useMemo(() => {
    const approved = practicals.filter(
      (p) => String(p.status).toLowerCase() === "approved"
    ).length;

    const pending = practicals.filter(
      (p) => String(p.status).toLowerCase() === "pending"
    ).length;

    const rejected = practicals.filter(
      (p) => String(p.status).toLowerCase() === "rejected"
    ).length;

    return {
      total: practicals.length,
      approved,
      pending,
      rejected,
    };
  }, [practicals]);

  if (!account) {
    return (
      <>
        <LandingPage
          onConnect={connectWallet}
          loading={loading || initializing}
          contractAddress={contractAddress}
        />

        {toast && <Toast {...toast} />}
      </>
    );
  }

  if (!isCorrectNetwork) {
    return (
      <>
        <div className="network-screen">
          <div className="network-card">
            <div className="brand-mark large">P</div>

            <div className="eyebrow">NETWORK REQUIRED</div>

            <h1>Switch to Ethereum Sepolia</h1>

            <p>
              PracChain is deployed on the Ethereum Sepolia test network.
              Please switch your MetaMask network to continue.
            </p>

            <button
              className="primary-btn"
              onClick={async () => {
                try {
                  await window.ethereum.request({
                    method: "wallet_switchEthereumChain",
                    params: [{ chainId: TARGET_CHAIN_HEX }],
                  });
                } catch (error) {
                  console.error(error);
                  showToast(
                    "Please switch to Sepolia manually in MetaMask.",
                    "error"
                  );
                }
              }}
            >
              Switch Network
            </button>

            <div className="wallet-info">
              Connected wallet
              <strong>{shortAddr(account)}</strong>
            </div>
          </div>
        </div>

        {toast && <Toast {...toast} />}
      </>
    );
  }

  return (
    <>
      <DashboardShell
        role={role}
        account={account}
        professorAddress={professorAddress}
        activePage={activePage}
        setActivePage={setActivePage}
        contractAddress={contractAddress}
        onDisconnect={() => window.location.reload()}
      >
        {role === "professor" ? (
          <ProfessorDashboard
            page={activePage}
            account={account}
            contractAddress={contractAddress}
            studentWalletInput={studentWalletInput}
            setStudentWalletInput={setStudentWalletInput}
            lookupStudent={lookupStudent}
            lookupStudentInfo={lookupStudentInfo}
            verifyStudent={handleVerifyStudent}
            reviewWallet={reviewWallet}
            setReviewWallet={setReviewWallet}
            reviewStudent={reviewStudent}
            reviewPracticals={reviewPracticals}
            lookupPracticals={lookupPracticals}
            updatePracticalStatus={updatePracticalStatus}
            loading={loading}
          />
        ) : (
          <StudentDashboard
            page={activePage}
            account={account}
            student={student}
            practicals={practicals}
            stats={studentStats}
            form={form}
            setForm={setForm}
            handleRegister={handleRegister}
            handleSubmitPractical={handleSubmitPractical}
            loading={loading}
            contractAddress={contractAddress}
          />
        )}
      </DashboardShell>

      {toast && <Toast {...toast} />}
    </>
  );
}

/* =========================
   LANDING PAGE
========================= */

function LandingPage({ onConnect, loading, contractAddress }) {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <div className="brand">
          <div className="brand-mark">P</div>

          <div>
            <div className="brand-name">PracChain</div>
            <div className="brand-subtitle">Blockchain Verification</div>
          </div>
        </div>

        <button className="nav-connect-btn" onClick={onConnect}>
          {loading ? <Spinner /> : null}
          {loading ? "Connecting..." : "Connect MetaMask"}
        </button>
      </header>

      <main className="landing-main">
        <section className="hero-section">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" />
              BLOCKCHAIN POWERED ACADEMICS
            </div>

            <h1>
              Practical submissions,
              <span> verified on-chain.</span>
            </h1>

            <p>
              PracChain provides a secure and transparent way for students to
              submit practical work and professors to verify student identity
              and approve submissions using blockchain technology.
            </p>

            <div className="hero-actions">
              <button className="primary-btn hero-btn" onClick={onConnect}>
                {loading ? <Spinner /> : null}
                {loading ? "Connecting..." : "Launch PracChain"}
                {!loading && <span>→</span>}
              </button>

              <div className="network-chip">
                <span className="network-dot" />
                Ethereum Sepolia
              </div>
            </div>

            <div className="hero-trust">
              <div>
                <strong>Decentralized</strong>
                <span>Blockchain records</span>
              </div>

              <div>
                <strong>Secure</strong>
                <span>Wallet-based identity</span>
              </div>

              <div>
                <strong>Transparent</strong>
                <span>Verifiable submissions</span>
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="orb orb-one" />
            <div className="orb orb-two" />

            <div className="blockchain-card">
              <div className="card-topline">
                <span>LIVE SYSTEM</span>
                <span className="green-dot" />
              </div>

              <div className="block-icon">
                <span>◈</span>
              </div>

              <div className="block-title">
                Student Practical
                <br />
                Verification
              </div>

              <div className="chain-flow">
                <div className="chain-item">
                  <div className="chain-circle">01</div>
                  <span>Register</span>
                </div>

                <div className="chain-line" />

                <div className="chain-item">
                  <div className="chain-circle">02</div>
                  <span>Verify</span>
                </div>

                <div className="chain-line" />

                <div className="chain-item">
                  <div className="chain-circle">03</div>
                  <span>Submit</span>
                </div>
              </div>

              <div className="hash-box">
                <span>CONTRACT</span>
                <strong>
                  {contractAddress
                    ? shortAddr(contractAddress)
                    : "Sepolia Smart Contract"}
                </strong>
              </div>
            </div>
          </div>
        </section>

        <section className="workflow-section">
          <div className="section-heading center">
            <div className="eyebrow">HOW IT WORKS</div>
            <h2>Simple workflow. Strong verification.</h2>
            <p>
              Everything important is recorded through a Solidity smart
              contract on Ethereum Sepolia.
            </p>
          </div>

          <div className="workflow-grid">
            <WorkflowCard
              number="01"
              title="Register Identity"
              text="Student connects MetaMask and registers their name and enrollment number."
            />

            <WorkflowCard
              number="02"
              title="Professor Verifies"
              text="The professor verifies the student's wallet identity directly on-chain."
            />

            <WorkflowCard
              number="03"
              title="Submit Practical"
              text="Verified students can submit practical titles and submission hashes."
            />

            <WorkflowCard
              number="04"
              title="Review & Approve"
              text="Professor reviews submissions and records Approved or Rejected status."
            />
          </div>
        </section>

        <section className="feature-section">
          <div className="feature-card">
            <div className="feature-icon">◆</div>
            <h3>Blockchain Identity</h3>
            <p>
              Wallet addresses provide a unique blockchain identity for every
              participant.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">✓</div>
            <h3>Tamper Resistant</h3>
            <p>
              Submission and verification records are stored through the smart
              contract.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">↗</div>
            <h3>Transparent Status</h3>
            <p>
              Students and professors can independently view the current
              submission status.
            </p>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span>PracChain</span>
        <span>Built on Ethereum Sepolia</span>
      </footer>
    </div>
  );
}

function WorkflowCard({ number, title, text }) {
  return (
    <div className="workflow-card">
      <div className="workflow-number">{number}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

/* =========================
   DASHBOARD SHELL
========================= */

function DashboardShell({
  role,
  account,
  professorAddress,
  activePage,
  setActivePage,
  contractAddress,
  onDisconnect,
  children,
}) {
  const professorNav = [
    {
      id: "overview",
      label: "Overview",
      icon: "⌂",
    },
    {
      id: "verify",
      label: "Verify Students",
      icon: "✓",
    },
    {
      id: "review",
      label: "Review Practicals",
      icon: "▤",
    },
  ];

  const studentNav = [
    {
      id: "overview",
      label: "Overview",
      icon: "⌂",
    },
    {
      id: "submit",
      label: "Submit Practical",
      icon: "＋",
    },
    {
      id: "practicals",
      label: "My Practicals",
      icon: "▤",
    },
    {
      id: "identity",
      label: "My Identity",
      icon: "◉",
    },
  ];

  const navItems = role === "professor" ? professorNav : studentNav;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">P</div>

          <div>
            <div className="brand-name">PracChain</div>
            <div className="brand-subtitle">Verification System</div>
          </div>
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-item ${
                activePage === item.id ? "active" : ""
              }`}
              onClick={() => setActivePage(item.id)}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span>{item.label}</span>

              {activePage === item.id && (
                <span className="active-indicator" />
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="network-status">
            <span className="green-dot" />

            <div>
              <strong>Ethereum Sepolia</strong>
              <span>Connected network</span>
            </div>
          </div>

          <div className="sidebar-wallet">
            <div className="wallet-avatar">
              {role === "professor" ? "P" : "S"}
            </div>

            <div className="wallet-details">
              <span>{role === "professor" ? "Professor" : "Student"}</span>
              <strong>{shortAddr(account)}</strong>
            </div>

            <button
              className="logout-btn"
              title="Disconnect"
              onClick={onDisconnect}
            >
              ↪
            </button>
          </div>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <div className="topbar-label">
              {role === "professor" ? "PROFESSOR PORTAL" : "STUDENT PORTAL"}
            </div>

            <div className="topbar-title">
              {activePage === "overview"
                ? "Overview"
                : activePage === "verify"
                ? "Verify Students"
                : activePage === "review"
                ? "Review Practicals"
                : activePage === "submit"
                ? "Submit Practical"
                : activePage === "practicals"
                ? "My Practicals"
                : "My Identity"}
            </div>
          </div>

          <div className="topbar-right">
            <div className="network-pill">
              <span className="green-dot" />
              Sepolia
            </div>

            <div className="top-wallet">
              <span className="wallet-dot" />
              {shortAddr(account)}
            </div>
          </div>
        </header>

        <div className="dashboard-content">{children}</div>

        <footer className="dashboard-footer">
          <span>PracChain</span>

          <span>
            Smart Contract:{" "}
            {contractAddress ? shortAddr(contractAddress) : "Not configured"}
          </span>

          <span>Ethereum Sepolia</span>
        </footer>
      </main>
    </div>
  );
}

/* =========================
   STUDENT DASHBOARD
========================= */

function StudentDashboard({
  page,
  account,
  student,
  practicals,
  stats,
  form,
  setForm,
  handleRegister,
  handleSubmitPractical,
  loading,
  contractAddress,
}) {
  if (page === "identity") {
    return (
      <StudentIdentity
        account={account}
        student={student}
        form={form}
        setForm={setForm}
        handleRegister={handleRegister}
        loading={loading}
      />
    );
  }

  if (page === "submit") {
    return (
      <StudentSubmit
        student={student}
        form={form}
        setForm={setForm}
        handleSubmitPractical={handleSubmitPractical}
        loading={loading}
      />
    );
  }

  if (page === "practicals") {
    return <StudentPracticals practicals={practicals} />;
  }

  return (
    <StudentOverview
      account={account}
      student={student}
      practicals={practicals}
      stats={stats}
      contractAddress={contractAddress}
    />
  );
}

function StudentOverview({
  account,
  student,
  practicals,
  stats,
  contractAddress,
}) {
  const verified = student?.verified;

  return (
    <div className="page-stack">
      <section className="welcome-banner">
        <div>
          <div className="eyebrow">STUDENT DASHBOARD</div>

          <h1>
            Welcome back
            {student?.name ? `, ${student.name}` : ""}.
          </h1>

          <p>
            Manage your blockchain identity and practical submissions from one
            place.
          </p>
        </div>

        <div className="welcome-status">
          <div className="status-label">IDENTITY STATUS</div>

          <StatusBadge type={verified ? "approved" : "pending"}>
            {verified ? "Verified" : "Verification Pending"}
          </StatusBadge>
        </div>
      </section>

      <section className="stats-grid four">
        <StatCard
          label="Identity"
          value={student?.registered ? "Registered" : "Not Registered"}
          icon="◉"
          tone={student?.registered ? "success" : "warning"}
        />

        <StatCard
          label="Verification"
          value={verified ? "Verified" : "Pending"}
          icon="✓"
          tone={verified ? "success" : "warning"}
        />

        <StatCard
          label="Submissions"
          value={stats.total}
          icon="▤"
          tone="blue"
        />

        <StatCard
          label="Approved"
          value={stats.approved}
          icon="◆"
          tone="cyan"
        />
      </section>

      <section className="dashboard-grid two">
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow">BLOCKCHAIN IDENTITY</div>
              <h2>Your Wallet</h2>
            </div>
          </div>

          <div className="wallet-large">
            <div className="wallet-large-icon">◈</div>

            <div>
              <span>Connected wallet address</span>
              <strong>{account}</strong>
            </div>
          </div>

          <div className="info-list">
            <InfoRow label="Network" value="Ethereum Sepolia" />
            <InfoRow
              label="Registration"
              value={student?.registered ? "Complete" : "Required"}
            />
            <InfoRow
              label="Verification"
              value={verified ? "Verified by Professor" : "Awaiting Professor"}
            />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow">RECENT ACTIVITY</div>
              <h2>Latest Practicals</h2>
            </div>

            <span className="count-pill">{practicals.length}</span>
          </div>

          {practicals.length === 0 ? (
            <EmptyState
              icon="▤"
              title="No practicals yet"
              text="Your submitted practicals will appear here."
            />
          ) : (
            <div className="activity-list">
              {practicals.slice(-3).reverse().map((item) => (
                <div className="activity-item" key={item.index}>
                  <div className="activity-icon">▤</div>

                  <div className="activity-main">
                    <strong>{item.title}</strong>
                    <span>{formatTime(item.submissionTime)}</span>
                  </div>

                  <StatusBadge
                    type={
                      String(item.status).toLowerCase() === "approved"
                        ? "approved"
                        : String(item.status).toLowerCase() === "rejected"
                        ? "rejected"
                        : "pending"
                    }
                  >
                    {item.status}
                  </StatusBadge>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel contract-panel">
        <div className="contract-icon">◇</div>

        <div>
          <div className="eyebrow">SMART CONTRACT</div>
          <h3>Blockchain-backed academic verification</h3>
          <p>
            Your identity and practical status are managed through the deployed
            PracChain smart contract on Ethereum Sepolia.
          </p>
        </div>

        <div className="contract-address">
          {contractAddress || "Contract address unavailable"}
        </div>
      </section>
    </div>
  );
}

function StudentIdentity({
  account,
  student,
  form,
  setForm,
  handleRegister,
  loading,
}) {
  const registered = student?.registered;
  const verified = student?.verified;

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="IDENTITY"
        title="My Identity"
        description="Register your academic identity using your blockchain wallet."
      />

      <section className="dashboard-grid two">
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow">WALLET IDENTITY</div>
              <h2>Student Profile</h2>
            </div>

            <StatusBadge type={verified ? "approved" : "pending"}>
              {verified ? "Verified" : "Pending"}
            </StatusBadge>
          </div>

          <div className="profile-wallet">
            <div className="profile-avatar">S</div>

            <div>
              <span>Wallet Address</span>
              <strong>{account}</strong>
            </div>
          </div>

          <div className="info-list">
            <InfoRow
              label="Name"
              value={student?.name || "Not registered"}
            />

            <InfoRow
              label="Enrollment No."
              value={student?.enrollmentNo || "Not registered"}
            />

            <InfoRow
              label="Registration"
              value={registered ? "Registered" : "Not registered"}
            />

            <InfoRow
              label="Professor Verification"
              value={verified ? "Verified" : "Pending"}
            />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow">REGISTRATION</div>
              <h2>Register Student</h2>
            </div>
          </div>

          {registered ? (
            <div className="success-state">
              <div className="success-icon">✓</div>

              <h3>Identity registered</h3>

              <p>
                Your wallet is already registered on the blockchain. Wait for
                the professor to verify your identity.
              </p>

              <StatusBadge type={verified ? "approved" : "pending"}>
                {verified
                  ? "Professor Verified"
                  : "Awaiting Professor Verification"}
              </StatusBadge>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="form-stack">
              <Input
                label="Full Name"
                placeholder="Enter your full name"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
              />

              <Input
                label="Enrollment Number"
                placeholder="Enter enrollment number"
                value={form.enrollmentNo}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    enrollmentNo: e.target.value,
                  }))
                }
              />

              <button
                className="primary-btn full"
                disabled={loading}
                type="submit"
              >
                {loading ? <Spinner /> : null}
                {loading ? "Registering..." : "Register Identity"}
              </button>

              <div className="form-note">
                Registration creates a blockchain transaction and cannot be
                duplicated for the same wallet.
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

function StudentSubmit({
  student,
  form,
  setForm,
  handleSubmitPractical,
  loading,
}) {
  const verified = student?.registered && student?.verified;

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="SUBMISSION"
        title="Submit Practical"
        description="Submit your practical work after your identity has been verified."
      />

      {!student?.registered ? (
        <LockedCard
          title="Registration required"
          text="Register your student identity before submitting practical work."
        />
      ) : !student?.verified ? (
        <LockedCard
          title="Verification required"
          text="Your identity must be verified by the professor before practical submission is enabled."
        />
      ) : (
        <section className="dashboard-grid two">
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="eyebrow">NEW SUBMISSION</div>
                <h2>Practical Details</h2>
              </div>

              <StatusBadge type="approved">Verified Student</StatusBadge>
            </div>

            <form onSubmit={handleSubmitPractical} className="form-stack">
              <Input
                label="Practical Title"
                placeholder="e.g. Experiment 1 — Blockchain Basics"
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
              />

              <Input
                label="Submission Hash / Reference"
                placeholder="Enter IPFS hash, GitHub URL, or submission reference"
                value={form.submissionHash}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    submissionHash: e.target.value,
                  }))
                }
              />

              <button
                className="primary-btn full"
                disabled={loading || !verified}
                type="submit"
              >
                {loading ? <Spinner /> : null}
                {loading ? "Submitting..." : "Submit Practical"}
              </button>
            </form>
          </div>

          <div className="panel submission-guide">
            <div className="guide-icon">◈</div>

            <div className="eyebrow">ON-CHAIN RECORD</div>

            <h2>What gets recorded?</h2>

            <div className="guide-list">
              <div>
                <span>01</span>
                <p>Practical title</p>
              </div>

              <div>
                <span>02</span>
                <p>Submission hash or reference</p>
              </div>

              <div>
                <span>03</span>
                <p>Submission timestamp</p>
              </div>

              <div>
                <span>04</span>
                <p>Pending review status</p>
              </div>
            </div>

            <div className="info-box">
              Each submission creates a blockchain transaction and remains
              associated with your wallet address.
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function StudentPracticals({ practicals }) {
  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="SUBMISSIONS"
        title="My Practicals"
        description="View the complete history of your blockchain-recorded practical submissions."
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">SUBMISSION HISTORY</div>
            <h2>All Practicals</h2>
          </div>

          <span className="count-pill">{practicals.length}</span>
        </div>

        {practicals.length === 0 ? (
          <EmptyState
            icon="▤"
            title="No submissions found"
            text="Once you submit a practical, it will appear here."
          />
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Practical</th>
                  <th>Submission Reference</th>
                  <th>Submitted</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {practicals.map((item) => (
                  <tr key={item.index}>
                    <td>{item.index + 1}</td>

                    <td>
                      <strong>{item.title}</strong>
                    </td>

                    <td>
                      <span className="hash-text">
                        {item.submissionHash}
                      </span>
                    </td>

                    <td>{formatTime(item.submissionTime)}</td>

                    <td>
                      <StatusBadge
                        type={
                          String(item.status).toLowerCase() === "approved"
                            ? "approved"
                            : String(item.status).toLowerCase() === "rejected"
                            ? "rejected"
                            : "pending"
                        }
                      >
                        {item.status}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* =========================
   PROFESSOR DASHBOARD
========================= */

function ProfessorDashboard({
  page,
  account,
  contractAddress,
  studentWalletInput,
  setStudentWalletInput,
  lookupStudent,
  lookupStudentInfo,
  verifyStudent,
  reviewWallet,
  setReviewWallet,
  reviewStudent,
  reviewPracticals,
  lookupPracticals,
  updatePracticalStatus,
  loading,
}) {
  if (page === "verify") {
    return (
      <ProfessorVerify
        studentWalletInput={studentWalletInput}
        setStudentWalletInput={setStudentWalletInput}
        lookupStudent={lookupStudent}
        lookupStudentInfo={lookupStudentInfo}
        verifyStudent={verifyStudent}
        loading={loading}
      />
    );
  }

  if (page === "review") {
    return (
      <ProfessorReview
        reviewWallet={reviewWallet}
        setReviewWallet={setReviewWallet}
        reviewStudent={reviewStudent}
        reviewPracticals={reviewPracticals}
        lookupPracticals={lookupPracticals}
        updatePracticalStatus={updatePracticalStatus}
        loading={loading}
      />
    );
  }

  return (
    <ProfessorOverview
      account={account}
      contractAddress={contractAddress}
    />
  );
}

function ProfessorOverview({ account, contractAddress }) {
  return (
    <div className="page-stack">
      <section className="welcome-banner professor">
        <div>
          <div className="eyebrow">PROFESSOR DASHBOARD</div>

          <h1>Academic verification control center.</h1>

          <p>
            Verify student identities, review practical submissions, and
            maintain trusted academic records on-chain.
          </p>
        </div>

        <div className="professor-badge">
          <div className="professor-badge-icon">P</div>

          <div>
            <span>ROLE</span>
            <strong>Professor</strong>
          </div>
        </div>
      </section>

      <section className="stats-grid four">
        <StatCard
          label="Role"
          value="Professor"
          icon="◉"
          tone="cyan"
        />

        <StatCard
          label="Network"
          value="Sepolia"
          icon="◆"
          tone="blue"
        />

        <StatCard
          label="Verification"
          value="On-chain"
          icon="✓"
          tone="success"
        />

        <StatCard
          label="Security"
          value="Wallet-based"
          icon="◇"
          tone="purple"
        />
      </section>

      <section className="dashboard-grid two">
        <div className="panel quick-actions">
          <div className="panel-header">
            <div>
              <div className="eyebrow">QUICK ACTIONS</div>
              <h2>Manage Students</h2>
            </div>
          </div>

          <div className="action-grid">
            <div className="action-card">
              <div className="action-icon">✓</div>
              <div>
                <h3>Verify Students</h3>
                <p>
                  Search a student's wallet and verify their identity.
                </p>
              </div>
            </div>

            <div className="action-card">
              <div className="action-icon">▤</div>
              <div>
                <h3>Review Practicals</h3>
                <p>
                  Review practical submissions and update their status.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow">PROFESSOR WALLET</div>
              <h2>Authorized Account</h2>
            </div>

            <StatusBadge type="approved">Authorized</StatusBadge>
          </div>

          <div className="wallet-large">
            <div className="wallet-large-icon professor">P</div>

            <div>
              <span>Connected professor wallet</span>
              <strong>{account}</strong>
            </div>
          </div>

          <div className="info-list">
            <InfoRow label="Network" value="Ethereum Sepolia" />
            <InfoRow label="Permission" value="Professor / Admin" />
            <InfoRow label="Smart Contract" value={shortAddr(contractAddress)} />
          </div>
        </div>
      </section>

      <section className="security-banner">
        <div className="security-icon">✓</div>

        <div>
          <strong>Professor access is protected by the smart contract.</strong>
          <p>
            Only the wallet that deployed this contract can verify students and
            approve or reject practical submissions.
          </p>
        </div>
      </section>
    </div>
  );
}

function ProfessorVerify({
  studentWalletInput,
  setStudentWalletInput,
  lookupStudent,
  lookupStudentInfo,
  verifyStudent,
  loading,
}) {
  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="STUDENT MANAGEMENT"
        title="Verify Students"
        description="Look up a student's blockchain identity and verify their registration."
      />

      <section className="panel search-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">STUDENT LOOKUP</div>
            <h2>Find Student</h2>
          </div>

          <div className="search-label">WALLET ADDRESS</div>
        </div>

        <div className="search-row">
          <input
            className="dark-input"
            placeholder="0x..."
            value={studentWalletInput}
            onChange={(e) => setStudentWalletInput(e.target.value)}
          />

          <button
            className="secondary-btn"
            onClick={lookupStudentInfo}
            disabled={loading}
          >
            {loading ? <Spinner /> : null}
            Lookup
          </button>
        </div>
      </section>

      {lookupStudent && (
        <section className="dashboard-grid two">
          <div className="panel">
            <div className="panel-header">
              <div>
                <div className="eyebrow">STUDENT PROFILE</div>
                <h2>{lookupStudent.name || "Unnamed Student"}</h2>
              </div>

              <StatusBadge
                type={
                  lookupStudent.verified ? "approved" : "pending"
                }
              >
                {lookupStudent.verified ? "Verified" : "Unverified"}
              </StatusBadge>
            </div>

            <div className="profile-card">
              <div className="profile-avatar professor">S</div>

              <div className="profile-fields">
                <div>
                  <span>Wallet Address</span>
                  <strong>{lookupStudent.address}</strong>
                </div>

                <div>
                  <span>Enrollment Number</span>
                  <strong>
                    {lookupStudent.enrollmentNo || "Not available"}
                  </strong>
                </div>

                <div>
                  <span>Registration</span>
                  <strong>
                    {lookupStudent.registered
                      ? "Registered"
                      : "Not Registered"}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          <div className="panel verification-action">
            <div className="verification-big-icon">
              {lookupStudent.verified ? "✓" : "!"}
            </div>

            <div className="eyebrow">
              {lookupStudent.verified
                ? "VERIFICATION COMPLETE"
                : "ACTION REQUIRED"}
            </div>

            <h2>
              {lookupStudent.verified
                ? "Student is verified"
                : "Verify this student"}
            </h2>

            <p>
              {lookupStudent.verified
                ? "This wallet has already been verified by the professor account."
                : "Verification allows this wallet to submit practical work to the blockchain."}
            </p>

            {!lookupStudent.verified && lookupStudent.registered && (
              <button
                className="primary-btn full"
                onClick={verifyStudent}
                disabled={loading}
              >
                {loading ? <Spinner /> : null}
                {loading ? "Verifying..." : "Verify Student"}
              </button>
            )}

            {!lookupStudent.registered && (
              <div className="warning-box">
                This wallet has not registered as a student yet.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function ProfessorReview({
  reviewWallet,
  setReviewWallet,
  reviewStudent,
  reviewPracticals,
  lookupPracticals,
  updatePracticalStatus,
  loading,
}) {
  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="SUBMISSION MANAGEMENT"
        title="Review Practicals"
        description="Look up a student wallet and review their practical submissions."
      />

      <section className="panel search-panel">
        <div className="panel-header">
          <div>
            <div className="eyebrow">SUBMISSION LOOKUP</div>
            <h2>Find Student Practicals</h2>
          </div>
        </div>

        <div className="search-row">
          <input
            className="dark-input"
            placeholder="Student wallet address: 0x..."
            value={reviewWallet}
            onChange={(e) => setReviewWallet(e.target.value)}
          />

          <button
            className="secondary-btn"
            onClick={lookupPracticals}
            disabled={loading}
          >
            {loading ? <Spinner /> : null}
            Load Practicals
          </button>
        </div>
      </section>

      {reviewStudent && (
        <>
          <section className="student-summary-bar">
            <div className="summary-avatar">S</div>

            <div className="summary-main">
              <strong>
                {reviewStudent.name || "Unnamed Student"}
              </strong>

              <span>{reviewStudent.enrollmentNo || "No enrollment number"}</span>
            </div>

            <div className="summary-wallet">
              {shortAddr(reviewStudent.address)}
            </div>

            <StatusBadge
              type={reviewStudent.verified ? "approved" : "pending"}
            >
              {reviewStudent.verified ? "Verified" : "Unverified"}
            </StatusBadge>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <div className="eyebrow">PRACTICAL RECORDS</div>
                <h2>Student Submissions</h2>
              </div>

              <span className="count-pill">
                {reviewPracticals.length}
              </span>
            </div>

            {reviewPracticals.length === 0 ? (
              <EmptyState
                icon="▤"
                title="No practical submissions"
                text="This student has not submitted any practicals yet."
              />
            ) : (
              <div className="review-list">
                {reviewPracticals.map((item) => {
                  const status = String(item.status).toLowerCase();

                  return (
                    <div className="review-card" key={item.index}>
                      <div className="review-number">
                        {String(item.index + 1).padStart(2, "0")}
                      </div>

                      <div className="review-content">
                        <div className="review-title-row">
                          <div>
                            <h3>{item.title}</h3>

                            <span>
                              Submitted {formatTime(item.submissionTime)}
                            </span>
                          </div>

                          <StatusBadge
                            type={
                              status === "approved"
                                ? "approved"
                                : status === "rejected"
                                ? "rejected"
                                : "pending"
                            }
                          >
                            {item.status}
                          </StatusBadge>
                        </div>

                        <div className="submission-reference">
                          <span>SUBMISSION REFERENCE</span>
                          <strong>{item.submissionHash}</strong>
                        </div>

                        {status === "pending" && (
                          <div className="review-actions">
                            <button
                              className="approve-btn"
                              onClick={() =>
                                updatePracticalStatus(item.index, true)
                              }
                              disabled={loading}
                            >
                              ✓ Approve
                            </button>

                            <button
                              className="reject-btn"
                              onClick={() =>
                                updatePracticalStatus(item.index, false)
                              }
                              disabled={loading}
                            >
                              × Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* =========================
   REUSABLE COMPONENTS
========================= */

function PageHeading({ eyebrow, title, description }) {
  return (
    <section className="page-heading">
      <div className="eyebrow">{eyebrow}</div>

      <h1>{title}</h1>

      <p>{description}</p>
    </section>
  );
}

function StatCard({ label, value, icon, tone = "blue" }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>

      <div className="stat-content">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <label className="input-group">
      <span>{label}</span>
      <input className="dark-input" {...props} />
    </label>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LockedCard({ title, text }) {
  return (
    <section className="locked-card">
      <div className="locked-icon">🔒</div>

      <div>
        <div className="eyebrow">ACCESS RESTRICTED</div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </section>
  );
}

function EmptyState({ icon, title, text }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>

      <h3>{title}</h3>

      <p>{text}</p>
    </div>
  );
}

function Toast({ message, type }) {
  return (
    <div className={`toast ${type}`}>
      <div className="toast-icon">
        {type === "error" ? "!" : "✓"}
      </div>

      <span>{message}</span>
    </div>
  );
}

export default App;