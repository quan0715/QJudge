# Validate configuration without Rails, network access, secret output or writes.
require 'yaml'
require 'openssl'

module PostalAddonConfig
  def self.validate_settings(config, password, host)
    raise 'invalid Postal settings' unless config.is_a?(Hash) && config['version'] == 2
    raise 'invalid Postal settings' unless config.dig('postal', 'web_hostname') == host && config.dig('postal', 'smtp_hostname') == host
    raise 'invalid Postal settings' unless config.dig('postal', 'web_protocol') == 'https'
    raise 'invalid Postal settings' if password.length < 16 || password.match?(/REPLACE|CHANGE_ME|[\r\n]/i)
    %w[main_db message_db].each do |group|
      raise 'invalid Postal settings' unless config.dig(group, 'host') == 'postal-db' && config.dig(group, 'username') == 'root'
      raise 'invalid Postal settings' unless (config.dig(group, 'port') || 3306) == 3306
      raise 'invalid Postal settings' unless config.dig(group, 'password') == password
    end
    raise 'invalid Postal settings' unless config.dig('main_db', 'database') == 'postal'
    raise 'invalid Postal settings' unless (config.dig('message_db', 'database_name_prefix') || 'postal') == 'postal'
    secret = config.dig('rails', 'secret_key')
    raise 'invalid Postal settings' unless secret.is_a?(String) && secret.length >= 64 && !secret.match?(/REPLACE|CHANGE_ME/i)
    raise 'invalid Postal settings' unless config.dig('smtp_server', 'tls_enabled') == true
    raise 'invalid Postal settings' unless (config.dig('smtp_server', 'tls_certificate_path') || '/config/smtp.cert') == '/config/smtp.cert'
    raise 'invalid Postal settings' unless (config.dig('smtp_server', 'tls_private_key_path') || '/config/smtp.key') == '/config/smtp.key'
    # Keep MariaDB's 256MB redo log at least ten times the message limit in MB.
    size = config.dig('smtp_server', 'max_message_size') || 14
    raise 'invalid Postal settings' unless size.is_a?(Integer) && size.between?(1, 25)
  end

  def self.read_password(path)
    # Shell command substitution removes the terminal newline; do not trim actual secret bytes.
    password = File.read(path).sub(/\n\z/, '')
    raise 'invalid database password whitespace' unless password == password.strip && !password.match?(/[\r\n]/)
    password
  end

  def self.validate_files(root, host)
    config = YAML.safe_load(File.read(File.join(root, 'postal.yml')))
    password = read_password(File.join(root, 'db-password'))
    validate_settings(config, password, host)
    signing = OpenSSL::PKey::RSA.new(File.read(File.join(root, 'signing.key')))
    raise unless signing.private? && signing.n.num_bits >= 2048
    key = OpenSSL::PKey.read(File.read(File.join(root, 'smtp.key')))
    cert = OpenSSL::X509::Certificate.new(File.read(File.join(root, 'smtp.cert')))
    raise unless cert.check_private_key(key) && cert.not_before <= Time.now && cert.not_after > Time.now
    raise unless OpenSSL::SSL.verify_certificate_identity(cert, host)
  end
end

if __FILE__ == $PROGRAM_NAME
  begin
    PostalAddonConfig.validate_files(ARGV[0] || '/config', ENV.fetch('POSTAL_HOSTNAME'))
    puts 'Postal configuration valid (certificate trust chain and delivery not checked).'
  rescue StandardError
    warn 'Postal configuration invalid or unreadable; check the template, file ownership, matching passwords, private keys and SMTP certificate locally. Values are not printed.'
    exit 1
  end
end
