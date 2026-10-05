import unittest
from qjudge_cli.check import check_env


class PasswordMailTests(unittest.TestCase):
    def smtp_errors(self, **values):
        return [error for error in check_env(values) if error.startswith(('EMAIL_', 'DEFAULT_FROM_EMAIL', 'PASSWORD_RESET_ENABLED'))]

    def test_feature_off_does_not_require_mail(self):
        self.assertEqual(self.smtp_errors(), [])

    def test_enabled_feature_requires_explicit_service_and_sender(self):
        errors = self.smtp_errors(EMAIL_MODE='external')
        self.assertTrue(any(error.startswith('EMAIL_HOST:') for error in errors))
        self.assertTrue(any(error.startswith('DEFAULT_FROM_EMAIL:') for error in errors))

    def test_valid_domain_sender_and_starttls(self):
        self.assertEqual(self.smtp_errors(EMAIL_MODE='external', EMAIL_HOST='smtp.provider.test', EMAIL_PORT='587', DEFAULT_FROM_EMAIL='QJudge <noreply@mail.q-judge.com>', EMAIL_HOST_USER='sender', EMAIL_HOST_PASSWORD='test-secret'), [])

    def test_tls_modes_are_mutually_exclusive(self):
        self.assertTrue(self.smtp_errors(EMAIL_USE_TLS='true', EMAIL_USE_SSL='true'))
        self.assertEqual(self.smtp_errors(EMAIL_USE_TLS='false', EMAIL_USE_SSL='true', EMAIL_PORT='465'), [])

    def test_invalid_values_and_unpaired_credentials(self):
        for values in ({'EMAIL_PORT': 'bad'}, {'EMAIL_TIMEOUT': '0'}, {'EMAIL_HOST_USER': 'sender'}, {'EMAIL_MODE': 'maybe'}):
            self.assertTrue(self.smtp_errors(**values))

    def sender_errors(self, sender, mode='external'):
        errors = self.smtp_errors(EMAIL_MODE=mode, EMAIL_HOST='smtp.provider.test', DEFAULT_FROM_EMAIL=sender)
        return [error for error in errors if error.startswith('DEFAULT_FROM_EMAIL:')]

    def test_sender_must_be_a_complete_mailbox_when_mail_is_enabled(self):
        for sender in ('noreply@mail.q-judge.com', 'QJudge <noreply@mail.q-judge.com>', '"QJudge, NYCU" <noreply@nycu.edu.tw>'):
            self.assertEqual(self.sender_errors(sender), [], sender)
        for sender in ('bad', 'not valid <sender@mail.q-judge.com', 'sender@mail.q-judge.com garbage',
                       'QJudge <noreply@example.com>', 'noreply@localhost', 'a <b@c.d> <e@f.g>',
                       'a,b@mail.example.edu', 'QJudge, NYCU <noreply@nycu.edu.tw>', 'x@y..com'):
            self.assertTrue(self.sender_errors(sender), sender)

    def test_unused_sender_does_not_block_disabled_mail(self):
        self.assertEqual(self.sender_errors('noreply@example.com', mode='disabled'), [])

    def test_disabled_and_unset_mail_do_not_require_smtp(self):
        for mode in ('', 'disabled'):
            self.assertEqual(self.smtp_errors(EMAIL_MODE=mode), [])

    def test_bundled_is_not_yet_a_supported_mail_mode(self):
        self.assertTrue(self.smtp_errors(EMAIL_MODE='bundled'))

    def test_legacy_switch_has_actionable_migration_error(self):
        errors = self.smtp_errors(PASSWORD_RESET_ENABLED='true')
        self.assertTrue(any('EMAIL_MODE' in error and 'removed' in error for error in errors))
