const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, CopyObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
require('dotenv').config();

const app = express();
const port = 3000;

// Set up multer for handling file uploads
const upload = multer({
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Not an image! Please upload an image.'), false);
        }
    }
});

// Create an S3 client (compatible with Tigris)
const S3 = new S3Client({
    region: "auto",
    endpoint: `https://fly.storage.tigris.dev`,
    credentials: {
        accessKeyId: process.env.TIGRIS_ACCESS_KEY,
        secretAccessKey: process.env.TIGRIS_SECRET_KEY
    }
});

app.use(express.static('public'));
app.use(express.json());

// Get images for a state
app.get('/api/images/:state', async (req, res) => {
    const state = req.params.state;
    const userId = req.query.userId;

    try {
        console.log(`Fetching images for state: ${state}, userId: ${userId}`);
        console.log(`Bucket name: ${process.env.BUCKET_NAME}`);

        const command = new ListObjectsV2Command({
            Bucket: process.env.BUCKET_NAME,
            Prefix: `${state}-`
        });

        const { Contents } = await S3.send(command);
        
        if (!Contents || Contents.length === 0) {
            console.log(`No images found for ${state}`);
            return res.json([]);
        }

        console.log(`Found ${Contents.length} objects for ${state}`);

        const images = await Promise.all(Contents.map(async (content) => {
            const getObjectCommand = new GetObjectCommand({
                Bucket: process.env.BUCKET_NAME,
                Key: content.Key
            });
            
            const { Metadata } = await S3.send(getObjectCommand);
            console.log(`Metadata for ${content.Key}:`, Metadata);
            const imageUrl = await getSignedUrl(S3, getObjectCommand, { expiresIn: 3600 });

            let userVotes = {};
            try {
                userVotes = Metadata?.userVotes ? JSON.parse(Metadata.userVotes) : {};
            } catch (e) {
                console.error('Error parsing userVotes:', e);
                userVotes = {};
            }

            console.log(`User votes for ${content.Key}:`, userVotes);
            console.log(`Current user (${userId}) vote:`, userVotes[userId]);

            return {
                key: content.Key,
                url: imageUrl,
                timestamp: content.LastModified,
                upvotes: Metadata?.upvotes ? parseInt(Metadata.upvotes) : 0,
                downvotes: Metadata?.downvotes ? parseInt(Metadata.downvotes) : 0,
                flagged: Metadata?.flagged === 'true',
                userVote: userVotes[userId] || null
            };
        }));

        console.log('Sending response with images:', images);
        res.json(images);
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Handle file upload
app.post('/api/upload', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const state = req.body.state;
    const fileBuffer = req.file.buffer;
    const fileName = `${state}-${Date.now()}.${req.file.originalname.split('.').pop()}`;

    try {
        await S3.send(new PutObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: fileName,
            Body: fileBuffer,
            ContentType: req.file.mimetype,
            Metadata: {
                upvotes: '0',
                downvotes: '0',
                flagged: 'false',
                userVotes: '{}'  // Initialize empty user votes
            }
        }));

        const imageUrl = await getSignedUrl(S3,
            new GetObjectCommand({
                Bucket: process.env.BUCKET_NAME,
                Key: fileName
            }),
            { expiresIn: 3600 }
        );

        res.json({ success: true, imageUrl, upvotes: 0, downvotes: 0 });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error uploading file');
    }
});

// Handle voting
app.post('/api/vote', express.json(), async (req, res) => {
    const { key, voteType, currentVote, userId } = req.body;
    console.log('Received vote request:', { key, voteType, currentVote, userId });

    try {
        const getCommand = new GetObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: key
        });

        const { Metadata } = await S3.send(getCommand);
        console.log('Current metadata:', Metadata);
        let upvotes = Metadata?.upvotes ? parseInt(Metadata.upvotes) : 0;
        let downvotes = Metadata?.downvotes ? parseInt(Metadata.downvotes) : 0;
        let userVotes = {};
        
        try {
            userVotes = Metadata?.userVotes ? JSON.parse(Metadata.userVotes) : {};
        } catch (e) {
            console.error('Error parsing userVotes:', e);
            userVotes = {};
        }

        const existingVote = userVotes[userId];
        console.log('Existing vote:', existingVote);

        // If clicking the same button that's already voted
        if (existingVote === voteType) {
            // User is trying to vote the same way again - ignore
            return res.json({
                success: true,
                upvotes,
                downvotes,
                userVote: existingVote
            });
        }

        // Switch the vote
        if (existingVote === 'up') {
            upvotes = Math.max(0, upvotes - 1);
            downvotes += 1;
        } else if (existingVote === 'down') {
            downvotes = Math.max(0, downvotes - 1);
            upvotes += 1;
        } else {
            // First time voting
            if (voteType === 'up') upvotes += 1;
            if (voteType === 'down') downvotes += 1;
        }

        userVotes[userId] = voteType;

        const newMetadata = {
            ...Metadata,
            upvotes: upvotes.toString(),
            downvotes: downvotes.toString(),
            userVotes: JSON.stringify(userVotes)
        };

        console.log('New metadata:', newMetadata);

        const copyCommand = new CopyObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            CopySource: `${process.env.BUCKET_NAME}/${key}`,
            Key: key,
            Metadata: newMetadata,
            MetadataDirective: 'REPLACE'
        });

        await S3.send(copyCommand);
        
        console.log('Vote updated successfully:', {
            upvotes,
            downvotes,
            userVote: userVotes[userId]
        });

        res.json({
            success: true,
            upvotes,
            downvotes,
            userVote: userVotes[userId]
        });
    } catch (error) {
        console.error('Error updating vote:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Handle flagging
app.post('/api/flag', express.json(), async (req, res) => {
    const { key } = req.body;

    try {
        const getCommand = new GetObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: key
        });

        const { Metadata } = await S3.send(getCommand);

        const newMetadata = {
            ...Metadata,
            flagged: 'true'
        };

        const copyCommand = new CopyObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            CopySource: `${process.env.BUCKET_NAME}/${key}`,
            Key: key,
            Metadata: newMetadata,
            MetadataDirective: 'REPLACE'
        });

        await S3.send(copyCommand);

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});