require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || "NIA_DATING_SECRET";

const DB_FILE = path.join(__dirname, "database.json");

/* =========================
DATABASE
========================= */

function getDB() {
  if (!fs.existsSync(DB_FILE)) {
    const data = {
      users: [],
      messages: [],
      likes: [],
      matches: []
    };

    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return data;
  }

  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (error) {
    return {
      users: [],
      messages: [],
      likes: [],
      matches: []
    };
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function userPublic(user) {
  return {
    id: user.id,
    name: user.name,
    age: user.age,
    location: user.location,
    bio: user.bio,
    emoji: user.emoji || "👤",
    gender: user.gender || "",
    premium: user.premium || false,
    createdAt: user.createdAt
  };
}

/* =========================
AUTH MIDDLEWARE
========================= */

function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({
      success: false,
      message: "Huja-login."
    });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Session imeisha. Login tena."
    });
  }
}

/* =========================
SIGNUP
========================= */

app.post("/api/signup", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      age,
      location,
      bio,
      gender
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Jaza Jina, Email na Password."
      });
    }

    const db = getDB();

    const exists = db.users.find(
      user => user.email.toLowerCase() === email.toLowerCase()
    );

    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Email hii tayari imesajiliwa."
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = {
      id: "user_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      age: age || "",
      location: location || "Tanzania",
      bio: bio || "Karibu NIA DATING ❤️",
      gender: gender || "",
      emoji: gender === "Female" ? "👩" : gender === "Male" ? "👨" : "👤",
      premium: false,
      createdAt: new Date().toISOString()
    };

    db.users.push(user);
    saveDB(db);

    const token = jwt.sign(
      { id: user.id },
      SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      message: "Account imetengenezwa! Karibu NIA DATING ❤️",
      token,
      user: userPublic(user)
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error."
    });
  }
});

/* =========================
LOGIN
========================= */

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const db = getDB();

    const user = db.users.find(
      user => user.email.toLowerCase() === String(email).toLowerCase()
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Email au password sio sahihi."
      });
    }

    const correct = await bcrypt.compare(
      password,
      user.password
    );

    if (!correct) {
      return res.status(401).json({
        success: false,
        message: "Email au password sio sahihi."
      });
    }

    const token = jwt.sign(
      { id: user.id },
      SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      message: "Umefanikiwa ku-login ❤️",
      token,
      user: userPublic(user)
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error."
    });
  }
});

/* =========================
MY PROFILE
========================= */

app.get("/api/me", auth, (req, res) => {
  const db = getDB();

  const user = db.users.find(
    user => user.id === req.userId
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User hakupatikana."
    });
  }

  res.json({
    success: true,
    user: userPublic(user)
  });
});

/* =========================
DISCOVER USERS
========================= */

app.get("/api/users", auth, (req, res) => {
  const db = getDB();

  const search = String(req.query.search || "").toLowerCase();

  const users = db.users
    .filter(user => user.id !== req.userId)
    .filter(user => {
      return (
        user.name.toLowerCase().includes(search) ||
        String(user.location || "").toLowerCase().includes(search)
      );
    })
    .map(userPublic)
    .reverse();

  res.json({
    success: true,
    users
  });
});

/* =========================
LIKE + MATCH
========================= */

app.post("/api/like/:id", auth, (req, res) => {
  const targetId = req.params.id;
  const db = getDB();

  const target = db.users.find(
    user => user.id === targetId
  );

  if (!target || targetId === req.userId) {
    return res.status(404).json({
      success: false,
      message: "Profile haijapatikana."
    });
  }

  const alreadyLiked = db.likes.find(
    like =>
      like.from === req.userId &&
      like.to === targetId
  );

  if (!alreadyLiked) {
    db.likes.push({
      from: req.userId,
      to: targetId,
      createdAt: new Date().toISOString()
    });
  }

  const reverseLike = db.likes.find(
    like =>
      like.from === targetId &&
      like.to === req.userId
  );

  let isMatch = false;

  if (reverseLike) {
    const matchId = [req.userId, targetId].sort().join("_");

    const exists = db.matches.find(
      match => match.id === matchId
    );

    if (!exists) {
      db.matches.push({
        id: matchId,
        users: [req.userId, targetId],
        createdAt: new Date().toISOString()
      });
    }

    isMatch = true;
  }

  saveDB(db);

  res.json({
    success: true,
    isMatch,
    message: isMatch
      ? "IT'S A MATCH! ❤️"
      : "Like imetumwa ❤️"
  });
});

/* =========================
GET MATCHES
========================= */

app.get("/api/matches", auth, (req, res) => {
  const db = getDB();

  const matches = db.matches
    .filter(match =>
      match.users.includes(req.userId)
    )
    .map(match => {
      const otherId = match.users.find(
        id => id !== req.userId
      );

      const user = db.users.find(
        user => user.id === otherId
      );

      return user ? userPublic(user) : null;
    })
    .filter(Boolean);

  res.json({
    success: true,
    matches
  });
});

/* =========================
GET MESSAGES
========================= */

app.get("/api/messages/:id", auth, (req, res) => {
  const otherId = req.params.id;

  const db = getDB();

  const messages = db.messages.filter(message =>
    (
      message.from === req.userId &&
      message.to === otherId
    ) ||
    (
      message.from === otherId &&
      message.to === req.userId
    )
  );

  res.json({
    success: true,
    messages
  });
});

/* =========================
SEND MESSAGE
========================= */

app.post("/api/messages/:id", auth, (req, res) => {
  const otherId = req.params.id;
  const text = String(req.body.text || "").trim();

  if (!text) {
    return res.status(400).json({
      success: false,
      message: "Andika ujumbe."
    });
  }

  const db = getDB();

  const otherUser = db.users.find(
    user => user.id === otherId
  );

  if (!otherUser) {
    return res.status(404).json({
      success: false,
      message: "User hajapatikana."
    });
  }

  const message = {
    id: "msg_" + Date.now(),
    from: req.userId,
    to: otherId,
    text,
    createdAt: new Date().toISOString()
  };

  db.messages.push(message);
  saveDB(db);

  res.json({
    success: true,
    message
  });
});

/* =========================
PREMIUM DEMO
========================= */

app.post("/api/premium/activate", auth, (req, res) => {
  const db = getDB();

  const user = db.users.find(
    user => user.id === req.userId
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User hajapatikana."
    });
  }

  user.premium = true;
  user.premiumSince = new Date().toISOString();

  saveDB(db);

  res.json({
    success: true,
    message: "NIA PREMIUM imewashwa 💎",
    user: userPublic(user)
  });
});

/* =========================
START SERVER
========================= */

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

app.listen(PORT, () => {
  console.log("");
  console.log("❤️ NIA DATING RUNNING");
  console.log("http://localhost:" + PORT);
  console.log("");
});
