const express = require("express");
const { ethers } = require("ethers");
require("dotenv").config();
const { abi: contractABI } = require("./abi/KeyManagerV2.json");

const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_API_KEY);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, signer);

const app = express();

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'"
  );
  next();
});

const setupSwagger = require("./swagger");
setupSwagger(app);

app.use(express.json());

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register a user with their public key
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - publicKey
 *             properties:
 *               userId:
 *                 type: string
 *               publicKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: User registered successfully
 *       400:
 *         description: Missing fields or user already registered
 *       500:
 *         description: Internal server error
 */
app.post("/register", async (req, res) => {
    const { userId, publicKey } = req.body;

    if (!userId || !publicKey) {
        return res.status(400).json({ error: "userId and publicKey fields are required" });
    }

    try {
        const publicKeyBytes = ethers.toUtf8Bytes(publicKey);

        const isRegistered = await contract.isUserRegistered(userId);
        if (isRegistered) {
            return res.status(400).json({ error: "User ID is already registered" });
        }

        const tx = await contract.setPublicKey(userId, publicKeyBytes);
        await tx.wait();
        res.status(200).json({ message: "User registered successfully", txHash: tx.hash });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /user/{userId}:
 *   get:
 *     summary: Get a user's public key
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to fetch
 *     responses:
 *       200:
 *         description: Successfully retrieved public key
 *       404:
 *         description: User not registered
 *       500:
 *         description: Internal server error
 */
app.get("/user/:userId", async (req, res) => {
    const { userId } = req.params;
    try {
        const isRegistered = await contract.isUserRegistered(userId);
        if (!isRegistered) {
            return res.status(404).json({ error: "User not registered" });
        }
        const publicKey = await contract.getPublicKey(userId);
        const publicKeyPlainText = ethers.toUtf8String(publicKey)
        res.status(200).json({ userId, publicKeyPlainText });
    } catch(error) {
        res.status(500).json({ error: error.message });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});