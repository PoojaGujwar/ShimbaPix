const { initializeDatabase } = require("./db.connection");
const express = require("express");
const app = express();
const dotenv = require("dotenv");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const axios = require("axios");
const cloudinary = require("cloudinary");
const multer = require("multer");
const bodyParser = require("body-parser");
const { verifyAccessToken } = require("./middleware/index.js");
const { setSecureCookie } = require("./services/index.js");
const Album = require("./models/Albums.model.js");
const ImageV2 = require("./models/Images.model.js");
const UserModel = require("./models/user.model.js");
const ShareData = require("./models/Shares.model.js");
const PORT = 4000;
const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app);
dotenv.config();

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: "https://simba-pix-ui.vercel.app",
     credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);


const io = new Server(server, {
  cors: {
    origin: "https://simba-pix-ui.vercel.app",
    credentials:true
  },
});

io.on("connection", (socket) => {
  console.log("User Connected", socket.id);
  socket.on("send_album", async (data) => {
    console.log(data, "DATA");
    const { sender, receiver, album } = data;
    const existingShare = await ShareData.findOne({ sender, receiver, album });
    if (existingShare) {
      console.log("Album already shared with this user.");

      //message send already send
      socket.emit("receive_album", {
        success: false,
        message: "Album already shared with this user.",
        data: null,
      });
      return;
    }
    const newShared = new ShareData({ sender, receiver, album });
    await newShared.save();
    io.emit("receive_album", data);
  });
  socket.on("disconnect", () => {
    console.log("User Disconnected", socket.io);
  });
});



initializeDatabase();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const storage = multer.diskStorage({});
const upload = multer({ storage });

app.get("/",(req,res)=>{
  res.send("Hello Google")
})

app.get("/auth/google", (req, res) => {
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=https://shimbapix.onrender.com/auth/google/callback&response_type=code&scope=profile email`
  res.redirect(googleAuthUrl);
});

app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Authorization code not provided");
  }
  let accessToken;
  try {
    const tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: `https://shimbapix.onrender.com/auth/google/callback`,
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    accessToken = tokenResponse.data.access_token;
    setSecureCookie(res, accessToken);
    return res.redirect(`${process.env.FRONTEND_URL}/v2/profile/google`);
  } catch (error) {
    console.error(error);
  }
});
app.get("/test-cookie", (req, res) => {
  console.log("Test Cookie Route – Cookies:", req.cookies);
  res.json({ cookies: req.cookies });
});
app.get("/user/profile/google", verifyAccessToken, async (req, res) => {
  console.log(req.cookies,"Pooja")
  try {
    const { access_token } = req.cookies;
  
    const googleUserDataResponse = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    let googleUser = googleUserDataResponse.data;
    let user = await UserModel.findOne({ userId: googleUser.id });
    if (!user) {
      user = await UserModel.create({
        userId: googleUser.id,
        name: googleUser.name,
        email: googleUser.email,
      });
    }
    console.log(user)
    res.status(200).json(googleUser);
  } catch (error) {
    res.status(500).json({ error: "Could not fetch user Google profile." });
  }
});

app.post("/albums",verifyAccessToken,async (req, res) => {
  console.log("/albums",req.cookies)
  try {
    const { name, description, ownerId, sharedUser } = req.body;
    if (!name || !description || !ownerId) {
      return res.status(400).json({ error: "Missing fields" });
    }
    const newAlbum = new Album({ name, description, ownerId });
    await newAlbum.save();
    res.status(202).json({ message: "Album added successfuly", newAlbum });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ message: "Album post error", error: error });
  }
});

app.get("/albums", verifyAccessToken, async (req, res) => {
  try {
    const allAlbums = await Album.find();
    res.status(200).json(allAlbums);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error fetching albums", error: error });
  }
});
app.post("/albums/:id/share", async (req, res) => {
  const albumId = req.params.id;
  const { sharedUser } = req.body;
  try {
    const updatedAlbum = await Album.findByIdAndUpdate(
      albumId,
      {
        $addToSet: { sharedUser: sharedUser },
      },
      {
        new: true,
      }
    );
    res
      .status(202)
      .json({ message: "Share album successfully", albums: updatedAlbum });
  } catch (error) {
    res.status(500).json({ message: "Error while update album", error: error });
  }
});
app.post("/albums/:id", async (req, res) => {
  const albumId = req.params.id;
  const updatedData = req.body;
  try {
    const updatedAlbum = await Album.findByIdAndUpdate(albumId, updatedData, {
      new: true,
    });
    res
      .status(202)
      .json({ message: "Updated successfully", albums: updatedAlbum });
  } catch (error) {
    res.status(500).json({ message: "Error while update album", error: error });
  }
});
app.delete("/albums/:id", async (req, res) => {
  const albumId = req.params.id;
  try {
    const imageDelete = await ImageV2.deleteMany({ albumId: albumId });
    const album = await Album.findByIdAndDelete(albumId);
    res.status(202).json({ message: "Deleted Successfully", album });
  } catch (error) {
    res.status(500).json({ message: "Error while delete album", error: error });
  }
});

app.post("/images", upload.single("image"), async (req, res) => {
  const {
    imageId,
    albumId,
    imageUrl,
    name,
    tags,
    person,
    isFavorite,
    comments,
    size,
  } = req.body;
  try {
    const file = req.file;
    if (!file) return res.status(400).send("no file uploaded");
    const result = await cloudinary.uploader.upload(file.path, {
      folder: "uploads",
    });
    const newImage = new ImageV2({
      imageId,
      albumId,
      imageUrl: result.secure_url,
      name,
      tags,
      person,
      isFavorite,
      comments,
      size: result.bytes,
    });
    await newImage.save();
    res.status(202).json({ message: "Image uploaded successfully", newImage });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ message: "Error while adding image", error: error });
  }
});

app.get("/images", verifyAccessToken, async (req, res) => {
  try {
    const images = await ImageV2.find();
    res.status(200).json(images);
  } catch (error) {
    res.status(500).json({ message: "Error fetching images", error: error });
  }
});
app.delete("/images/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const images = await ImageV2.findByIdAndDelete(id);
    res.status(200).json({ message: "Image delete successfully", images });
  } catch (error) {
    res.status(500).json({ message: "Error while delete image", error: error });
  }
});
app.get("/v1/users", async (req, res) => {
  const { currentEmail } = req.query;
  try {
    const users = await UserModel.find({ email: { $ne: currentEmail } });
    res.status(200).json(users);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error while user fetching", error: error });
  }
});

app.get("/v1/shareData", async (req, res) => {
  try {
    const data = await ShareData.find().populate("album");
    res.status(200).json(data);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error while fetching share album", error: error });
  }
});
app.delete("/v1/shareData/:id", async (req, res) => {
  const albumId = req.params.id;
  try {
    const allData = await ShareData.deleteMany({ album: albumId });
    res.status(200).json({ message: "Share data deleted", data: allData });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error while delete share album", error: error });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
