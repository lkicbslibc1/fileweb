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
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     // แยกโฟลเดอร์ตาม User ID เพื่อความเป็นระเบียบ
//     const userId = req.headers["user-id"];
//     const userDir = path.join(UPLOAD_DIR, userId);

//     if (!fs.existsSync(userDir)) {
//       fs.mkdirSync(userDir, { recursive: true });
//     }
//     cb(null, userDir);
//   },
//   filename: (req, file, cb) => {
//     // ใช้ชื่อไฟล์เดิม (หรือจะเปลี่ยนชื่อเพื่อกันซ้ำก็ได้)
//     file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
//     cb(null, file.originalname);
//   }
// });
// --- Multer Storage Config ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.headers["user-id"];
    const userDir = path.join(UPLOAD_DIR, userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    // 1. แปลงชื่อไทยให้ถูกต้องก่อน
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    // 2. แยกชื่อไฟล์กับนามสกุลออกจากกัน
    const ext = path.extname(decodedName);
    const nameWithoutExt = path.basename(decodedName, ext);
    
    const userId = req.headers["user-id"];
    const userDir = path.join(UPLOAD_DIR, userId);
    
    let fileName = decodedName;
    let counter = 1;

    //  ถ้าชื่อนี้มีอยู่แล้วในโฟลเดอร์ ให้เติม (1), (2) ไปเรื่อยๆ 
    while (fs.existsSync(path.join(userDir, fileName))) {
      fileName = `${nameWithoutExt} (${counter})${ext}`;
      counter++;
    }

    cb(null, fileName);
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
  const { ownerId, ownerName } = req.body;
  const file = req.file;

  if (!file) return res.status(400).json({ message: "No file uploaded" });

  // บันทึกข้อมูลไฟล์ลง JSON
  const newFileRecord = {
    // ใช้ file.filename เพราะเป็นชื่อที่ Multer รันเลข (1) ให้เราเรียบร้อยแล้ว
    filename: file.filename, 
    ownerID: ownerId,
    OwnerUsername: ownerName
  };

  saveFileRecord(newFileRecord);
  res.json({ message: "File uploaded successfully!" });
});

// 4. Get Files (แยก Role)
app.get("/files", (req, res) => {
  const { role, username } = req.query;
  const allFiles = getFileRecords();
  const users = getUsers();

  const currentUser = users.find(u => u.username === username);
  const currentId = currentUser ? currentUser.id : null;

  if (role === "admin") {
    // Admin เห็นทั้งหมด
    res.json(allFiles);
  } else {
    // User sees: Own files OR Public files OR Files shared with them
    const accessibleFiles = allFiles.filter((f) => {
      const isOwner = String(f.ownerID) === String(currentId);
      const isPublic = f.visibility === 'public';
      const isSharedWithMe = f.sharedWith && f.sharedWith.includes(String(currentId));

      return isOwner || isPublic || isSharedWithMe;
    });
    res.json(accessibleFiles);
  }
});

// API Get Users (For Admin Share Modal)
app.get("/users", (req, res) => {
  const users = getUsers();
  // ส่งไปเฉพาะ ID, Username, Role (ไม่ส่ง Password)
  const safeUsers = users.map(u => ({ id: u.id, username: u.username, role: u.role }));
  res.json(safeUsers);
});

// API Update Share Settings (Public/Private + Specific Users)
app.patch("/files/share", (req, res) => {
  const { ownerId, filename, isPublic, sharedWith } = req.body;
  let records = getFileRecords();

  // Find record by filename AND ownerId
  const index = records.findIndex(r => r.filename === filename && String(r.ownerID) === String(ownerId));

  if (index !== -1) {
    records[index].visibility = isPublic ? 'public' : 'private';
    // Ensure sharedWith is an array of strings
    records[index].sharedWith = sharedWith || [];

    fs.writeFileSync(FILES_RECORD, JSON.stringify(records, null, 2));
    res.json({ success: true, message: "Sharing settings updated" });
  } else {
    res.status(404).json({ success: false, message: "File record not found" });
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
    if (fs.existsSync(fallbackPath)) {
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
    if (fs.existsSync(fallbackPath)) {
      res.download(fallbackPath, filename);
    } else {
      res.status(404).send("File not found");
    }
  }
});

// 7. Delete File
app.delete("/files", (req, res) => {
  const { ownerId, filename } = req.body;
  let records = getFileRecords();

  // Find index
  const index = records.findIndex(r => r.filename === filename && String(r.ownerID) === String(ownerId));

  if (index !== -1) {
    // Remove from array
    records.splice(index, 1);
    fs.writeFileSync(FILES_RECORD, JSON.stringify(records, null, 2));

    // Remove actual file
    const filePath = path.join(UPLOAD_DIR, String(ownerId), filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    } else {
      // Check fallback path
      const fallbackPath = path.join(UPLOAD_DIR, filename);
      if (fs.existsSync(fallbackPath)) fs.unlinkSync(fallbackPath);
    }

    res.json({ success: true, message: "File deleted" });
  } else {
    res.status(404).json({ success: false, message: "File not found in records" });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});