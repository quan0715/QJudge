"""Keep storage-capacity failures actionable without leaking provider details."""
from unittest import IsolatedAsyncioTestCase
from unittest.mock import Mock

from botocore.exceptions import ClientError

from infrastructure.artifacts.s3_artifact_store import ArtifactStorageError, S3ArtifactStore


class ArtifactStorageErrorTests(IsolatedAsyncioTestCase):
    async def test_full_storage_requires_freeing_space_before_retrying(self):
        provider_error = ClientError(
            {"Error": {"Code": "XMinioStorageFull", "Message": "private provider details"}},
            "PutObject",
        )
        client = Mock()
        client.put_object.side_effect = provider_error
        store = S3ArtifactStore(bucket="test", client=client)
        for filename in ("rubric.md", "grade.csv"):
            with self.subTest(filename=filename):
                with self.assertRaises(ArtifactStorageError) as raised:
                    await store.put(filename, b"test", "text/plain")
                self.assertEqual(str(raised.exception),
                    "Artifact storage is full. Ask an administrator to free storage space before retrying.")
                self.assertIs(raised.exception.__cause__, provider_error)

    async def test_other_provider_errors_stay_generic(self):
        client = Mock()
        client.put_object.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "private provider details"}},
            "PutObject",
        )
        store = S3ArtifactStore(bucket="test", client=client)
        with self.assertRaisesRegex(ArtifactStorageError, "^Failed to upload artifact$"):
            await store.put("rubric.md", b"test", "text/markdown")

    async def test_successful_upload_is_unchanged(self):
        client = Mock()
        store = S3ArtifactStore(bucket="test", client=client)
        await store.put("grade.csv", b"id,score\n", "text/csv")
        client.put_object.assert_called_once_with(
            Bucket="test", Key="grade.csv", Body=b"id,score\n", ContentType="text/csv",
        )


if __name__ == "__main__":
    import unittest
    unittest.main()
