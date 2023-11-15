const AWS = require('aws-sdk');

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3({
  region: 'ap-southeast-1',
  accessKeyId: 'AKIAXKR26MDHMWBO2352',
  secretAccessKey: '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',
});
// import {getSignedUrl} from 'aws-sdk/s3-request-presigner';
// ...
// const client = new S3Client(clientParams);
// const command = new GetObjectCommand(getObjectParams);
// const url = await getSignedUrl(client, command, {expiresIn: 3600});

const getPresignedUrl = () => {
  const url = s3.getSignedUrl('getObject', {
    Bucket: 'ledgerbook',
    Key: 'myKey',
    Expires: 60 * 5,
  });
};
