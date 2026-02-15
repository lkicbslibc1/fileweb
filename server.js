const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());
app.use(express.static("."));
app.use(express.static("uploads"));

const USERS_FILE = "users.json";
const FILES_RECORD = "file_records.json";
const UPLOAD_DIR = "uploads";

// สร้างโฟลเดอร์ uploads ถ้ายังไม่มี
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

// --- Helper Functions ---

function getUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    const defaultData = [{ id: "1", username: "admin", password: "123", role: "admin" }];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  const rawData = fs.readFileSync(USERS_FILE);
  return JSON.parse(rawData);
}

function saveUser(userObj) {
  const users = getUsers();
  users.push(userObj);
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function getFileRecords() {
  if (!fs.existsSync(FILES_RECORD)) return [];
  return JSON.parse(fs.readFileSync(FILES_RECORD));
}

function saveFileRecord(record) {
  const records = getFileRecords();
  records.push(record);
  fs.writeFileSync(FILES_RECORD, JSON.stringify(records, null, 2));
}

// --- Multer Storage Config ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // แยกโฟลเดอร์ตาม User ID เพื่อความเป็นระเบียบ
    const userId = req.headers["user-id"];
    const userDir = path.join(UPLOAD_DIR, userId);
    
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    // ใช้ชื่อไฟล์เดิม (หรือจะเปลี่ยนชื่อเพื่อกันซ้ำก็ได้)
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

// --- Routes ---

// 1. Register
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();
  if (users.find((u) => u.username === username)) {
    return res.json({ success: false, message: "Username already exists" });
  }
  const newUser = { id: Date.now(), username, password, role: "user" };
  saveUser(newUser);
  res.json({ success: true });
});

// 2. Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();
  const user = users.find((u) => u.username === username && u.password === password);
  if (user) {
    res.json({ success: true, id: user.id, username: user.username, role: user.role });
  } else {
    res.json({ success: false, message: "Invalid credentials" });
  }
});

// 3. Upload File
app.post("/upload", upload.single("file"), (req, res) => {
  // รับข้อมูลจาก FormData
  const { ownerId, ownerName } = req.body;
  const file = req.file;

  if (!file) return res.status(400).json({ message: "No file uploaded" });

  // บันทึกข้อมูลไฟล์ลง JSON
  const newFileRecord = {
    filename: file.originalname,
    ownerID: ownerId,
    OwnerUsername: ownerName // สำคัญสำหรับ Admin Grouping
  };
  
  saveFileRecord(newFileRecord);

  res.json({ message: "File uploaded successfully!" });
});

// 4. Get Files (แยก Role)
app.get("/files", (req, res) => {
  const { role, username } = req.query;
  const allFiles = getFileRecords();
  const users = getUsers();
  
  // หา User object เพื่อเอา ID (กรณีส่งมาแต่ username)
  const currentUser = users.find(u => u.username === username);
  const currentId = currentUser ? currentUser.id : null;

  if (role === "admin") {
    // Admin เห็นทั้งหมด
    res.json(allFiles);
  } else {
    // User เห็นแค่ของตัวเอง
    const myFiles = allFiles.filter((f) => String(f.ownerID) === String(currentId));
    res.json(myFiles);
  }
});

// 5. Preview File
app.get("/preview/:userId/:filename", (req, res) => {
  const { userId, filename } = req.params;
  const filePath = path.join(__dirname, "uploads", userId, filename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    // Fallback กรณีหาไม่เจอ (เผื่อไฟล์เก่าที่ไม่ได้อยู่ใน subfolder)
    const fallbackPath = path.join(__dirname, "uploads", filename);
    if(fs.existsSync(fallbackPath)){
        res.sendFile(fallbackPath);
    } else {
        res.status(404).send("File not found");
    }
  }
});

// 6. Download File
app.get("/download/:userId/:filename", (req, res) => {
  const { userId, filename } = req.params;
  const filePath = path.join(__dirname, "uploads", userId, filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath, filename);
  } else {
      // Fallback
      const fallbackPath = path.join(__dirname, "uploads", filename);
      if(fs.existsSync(fallbackPath)){
          res.download(fallbackPath, filename);
      } else {
          res.status(404).send("File not found");
      }
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});