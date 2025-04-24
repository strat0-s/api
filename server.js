const express = require("express");
const { ethers } = require("ethers");
require("dotenv").config();
const { abi: contractABI } = require("./abi/KeyManagerV2.json");

const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_API_KEY);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, signer);

const app = express();
app.use(express.json());

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