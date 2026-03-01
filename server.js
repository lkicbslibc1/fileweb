const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs"); // โมดูลสำหรับจัดการไฟล์ (File System)
const path = require("path");

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());
app.use(express.static("."));
app.use(express.static("uploads"));

const USERS_FILE = "users.json";
const FILES_RECORD = "file_records.json";

function getUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    const defaultData = [{ id : "1" , username: "admin", password: "123", role: "admin" }];
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

function createFolder (userID) {
  const userPath = path.join(__dirname, 'uploads', userID);
    if (!fs.existsSync(userPath)) {
        fs.mkdirSync(userPath, { recursive: true });
    }
  return userPath
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const userId = req.headers['user-id'] || 'guest';
        cb(null, createFolder(userId)); 
    },
    filename: (req, file, cb) => {
        const utf8Name = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, utf8Name);
    }
});

const upload = multer({ storage });






app.get('/', (req,res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();

  // เช็คชื่อซ้ำ
  if (users.find((u) => u.username === username)) {
    return res.json({ success: false, message: "Username นี้มีคนใช้แล้วครับ" });
  }

  let randomId = Date.now()
  // บันทึกลงไฟล์จริง! (ให้เป็น role: user อัตโนมัติ)
  saveUser({ id: randomId,username, password, role: "user" });

  console.log(`New user registered: ${username}`);
  res.json({ success: true, message: "สมัครสมาชิกสำเร็จ! กรุณาล็อกอิน" });
});

// API ล็อกอิน (Login)
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const users = getUsers(); // อ่านข้อมูลล่าสุดจากไฟล์

  const user = users.find(
    (u) => u.username === username && u.password === password,
  );
  if (user) {
    res.json({ success: true,id: user.id, username: user.username, role: user.role });
  } else {
    res
      .status(401)
      .json({ success: false, message: "ชื่อผู้ใช้หรือรหัสผ่านผิด" });
  }
});

// API Upload
app.post("/upload", upload.single("file"), (req, res) => {
  const ownerId = req.body.ownerId || "unknown";
  const ownerName = req.body.ownerName || "unknown";
  saveFileRecord({ 
    filename: req.file.filename, 
    ownerID: ownerId,
   OwnerUsername : ownerName});
  res.json({
    message: "File uploaded successfully",
    filename: req.file.filename,
  });
});

// API Get Files
app.get("/files", (req, res) => {
const { role, username } = req.query;
  const users = getUsers();
  const user = users.find(u => u.username === username);

  if (!user) return res.status(404).json({ error: "ไม่พบผู้ใช้" });
  const userPath = createFolder(user.id.toString());

  fs.readdir(userPath, (err, files) => {
    if (err) return res.status(500).json({ error: "อ่านไฟล์ไม่ได้" });
    res.json(files);
  });
});
// API สำหรับแสดงตัวอย่างรูปภาพ
app.get("/preview/:userId/:filename", (req, res) => {
  const { userId, filename } = req.params;
  
  // สร้าง Path ไปยังไฟล์ในโฟลเดอร์ ID ของ User
  const filePath = path.join(__dirname, "uploads", userId, filename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath); // ส่งไฟล์ไปแสดงบนหน้าเว็บ
  } else {
    // กรณีพิเศษ: ถ้าหาในโฟลเดอร์ ID ไม่เจอ ให้ลองหาที่โฟลเดอร์กลาง (เผื่อเป็นไฟล์เก่า)
    const fallbackPath = path.join(__dirname, "uploads", filename);
    if (fs.existsSync(fallbackPath)) {
      res.sendFile(fallbackPath);
    } else {
      res.status(404).send("ไม่พบไฟล์รูปภาพ");
    }
  }
});
app.get("/download/:filename", (req, res) => {
  const filePath = path.join(__dirname, "uploads", req.params.filename);
  res.download(filePath);
});



app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});