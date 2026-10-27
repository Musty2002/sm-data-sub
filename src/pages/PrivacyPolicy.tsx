import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const lastUpdated = 'October 27, 2026';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="flex items-center gap-4 px-4 py-4 max-w-3xl mx-auto">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-lg font-bold text-foreground">Privacy Policy</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 pb-20">
        <div className="prose prose-sm max-w-none text-foreground">
          <p className="text-muted-foreground text-sm mb-6">Last updated: {lastUpdated}</p>

          <h2 className="text-xl font-bold mb-3">1. Introduction</h2>
          <p className="mb-4 text-sm leading-relaxed">
            SM Data Sub ("we," "our," or "us"), operated by Sir Smarewa Ltd (RC: 9198148), a company registered in Nigeria, 
            provides a mobile application ("App") that enables users to purchase airtime, data bundles, pay utility bills, 
            subscribe to cable TV services, purchase examination pins, and manage digital wallets. This Privacy Policy explains 
            how we collect, use, disclose, and safeguard your information when you use our mobile application. Please read this 
            privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access the application.
          </p>

          <h2 className="text-xl font-bold mb-3">2. Information We Collect</h2>
          
          <h3 className="text-base font-semibold mb-2">2.1 Personal Information Provided During Registration</h3>
          <p className="mb-2 text-sm leading-relaxed">When you create an account, we collect:</p>
          <ul className="list-disc pl-5 mb-4 text-sm space-y-1">
            <li><strong>Full Name</strong> — used for account identification and virtual account creation</li>
            <li><strong>Email Address</strong> — used for account login, password recovery, and transactional notifications</li>
            <li><strong>Phone Number</strong> — used for account login, service delivery (airtime/data purchases), and communication</li>
            <li><strong>Password</strong> — stored in encrypted/hashed form for account security</li>
            <li><strong>Referral Code</strong> (optional) — used to track referral relationships and credit referral bonuses</li>
          </ul>

          <h3 className="text-base font-semibold mb-2">2.2 Financial and Transaction Information</h3>
          <ul className="list-disc pl-5 mb-4 text-sm space-y-1">
            <li><strong>Wallet Balance</strong> — maintained to facilitate purchases and transfers within the App</li>
            <li><strong>Transaction History</strong> — records of all purchases including airtime, data, electricity, TV subscriptions, exam pins, cashback earned/withdrawn, referral bonuses, and wallet deposits</li>
            <li><strong>Virtual Bank Account Details</strong> — generated via our payment partner (PaymentPoint/PalmPay) for wallet funding, including account number and account name</li>
            <li><strong>Meter Numbers</strong> — entered by users for electricity bill payments</li>
            <li><strong>Smart Card / IUC Numbers</strong> — entered by users for cable TV subscription payments</li>
            <li><strong>Cashback Wallet Information</strong> — balance, earnings, and withdrawal history</li>
          </ul>

          <h3 className="text-base font-semibold mb-2">2.3 Device and Technical Information</h3>
          <p className="mb-2 text-sm leading-relaxed">We automatically collect certain device and technical information, including:</p>
          <ul className="list-disc pl-5 mb-4 text-sm space-y-1">
            <li><strong>Device Model, Manufacturer, and OS Version</strong> — used for compatibility, debugging, and login session tracking</li>
            <li><strong>Platform Information</strong> (Android/iOS/Web) — to deliver platform-specific features and track login sessions</li>
            <li><strong>Device Identifier</strong> — a unique device identifier used for login session tracking and security monitoring</li>
            <li><strong>User Agent String</strong> — browser/app identification string for session tracking</li>
            <li><strong>Screen Resolution</strong> — for optimizing the user interface</li>
            <li><strong>Network Connection Status and Type</strong> — to handle offline scenarios and optimize performance</li>
            <li><strong>Whether the Device is Virtual/Emulated</strong> — for security and fraud detection purposes</li>
          </ul>

          <h3 className="text-base font-semibold mb-2">2.4 Biometric Data</h3>
          <p className="mb-4 text-sm leading-relaxed">
            If you enable biometric authentication (fingerprint, face recognition, or iris scanning), the App uses your 
            device's native biometric APIs to verify your identity. <strong>We do not store, transmit, or have access to 
            your actual biometric data</strong>. Biometric verification is processed entirely on your device using the 
            operating system's secure biometric framework. We only store a local preference indicating whether biometric 
            login is enabled and the associated account identifier.
          </p>

          <h3 className="text-base font-semibold mb-2">2.5 Push Notification Tokens</h3>
          <p className="mb-4 text-sm leading-relaxed">
            When you grant notification permission, we collect your Firebase Cloud Messaging (FCM) push notification token. 
            This token is stored in our database and associated with your user account to deliver transaction alerts, 
            credit notifications, promotional messages, and important service updates. We also store basic device metadata 
            (platform type, whether the device is native) alongside the token for notification delivery optimization.
          </p>

          <h3 className="text-base font-semibold mb-2">2.6 Login Session Data</h3>
          <p className="mb-4 text-sm leading-relaxed">
            Each time you log in, we record a login session that includes: timestamp, platform (Android/iOS/Web), 
            device information, user agent, and a flag indicating whether the login appears suspicious. This data is 
            used for security monitoring and unauthorized access detection.
          </p>

          <h3 className="text-base font-semibold mb-2">2.7 Transaction PIN</h3>
          <p className="mb-4 text-sm leading-relaxed">
            You may set up a 4-digit transaction PIN for authorizing purchases. This PIN is stored locally on your 
            device and is used to verify your identity before processing financial transactions. The PIN is not 
            transmitted to our servers.
          </p>

          <h3 className="text-base font-semibold mb-2">2.8 Profile Information</h3>
          <ul className="list-disc pl-5 mb-4 text-sm space-y-1">
            <li><strong>Avatar/Profile Picture</strong> — optionally uploaded by users for profile personalization</li>
            <li><strong>Account Number</strong> — a system-generated number for in-app identification</li>
            <li><strong>Referral Code</strong> — a system-generated unique code for the referral program</li>
          </ul>

          <h3 className="text-base font-semibold mb-2">2.9 National Identity Number (NIN)</h3>
          <p className="mb-4 text-sm leading-relaxed">
            To obtain a PalmPay virtual bank account number for wallet funding, you may be required to provide your 
            11-digit National Identity Number (NIN). In line with Central Bank of Nigeria (CBN) and PalmPay compliance 
            requirements, your NIN is collected solely for the purpose of identity verification and Know-Your-Customer 
            (KYC) checks during virtual account creation. Your NIN is transmitted securely to our payment partner 
            (PaymentPoint/PalmPay) for this verification and is stored with the same level of protection as your other 
            personal data. <strong>We do not use your NIN for marketing purposes and we do not share it with any other 
            third party</strong>. Providing your NIN is optional — you can continue using the App with your Paga (Aspfiy) 
            virtual account without submitting a NIN.
          </p>

          <h2 className="text-xl font-bold mb-3">3. How We Use Your Information</h2>
          <p className="mb-2 text-sm leading-relaxed">We use the collected information for the following purposes:</p>
          
          <h3 className="text-base font-semibold mb-2">3.1 Service Delivery</h3>
          <ul className="list-disc pl-5 mb-4 text-sm space-y-1">
            <li>Processing airtime purchases for MTN, Airtel, Glo, and 9mobile networks</li>
            <li>Processing mobile data bundle purchases across all supported networks and plan types (SME, Corporate Gifting, Direct Gifting, etc.)</li>
            <li>Processing electricity bill payments (prepaid and postpaid meters) across all Nigerian distribution companies</li>
            <li>Processing cable TV subscriptions for DSTV, GOTV, and Startimes</li>
            <li>Processing examination pin purchases for WAEC, NECO, and JAMB</li>
            <li>Managing your digital wallet (deposits, balance tracking, transaction history)</li>
            <li>Generating and managing virtual bank accounts for wallet funding via PalmPay</li>
            <li>Processing cashback rewards on eligible purchases (airtime and data)</li>
            <li>Processing peer-to-peer wallet transfers between SM Data Sub users</li>
            <li>Managing the referral bonus program (₦200 for referrer, ₦100 for referee)</li>
            <li>Generating and sharing transaction receipts</li>
          </ul>

          <h3 className="text-base font-semibold mb-2">3.2 Account Security</h3>
          <ul className="list-disc pl-5 mb-4 text-sm space-y-1">
            <li>Authenticating users via email/phone and password</li>
            <li>Providing biometric authentication (fingerprint/face unlock) as an alternative login method</li>
            <li>Verifying transactions via 4-digit PIN or biometric authentication</li>
            <li>Monitoring login sessions for suspicious activity</li>
            <li>Implementing app lock functionality to prevent unauthorized access</li>
            <li>Facilitating password reset via email verification</li>
            <li>Facilitating transaction PIN reset via email verification code</li>
            <li>Blocking accounts engaged in unauthorized or suspicious activity</li>
          </ul>

          <h3 className="text-base font-semibold mb-2">3.3 Communication</h3>
          <ul className="list-disc pl-5 mb-4 text-sm space-y-1">
            <li>Sending push notifications for transaction confirmations and credit alerts</li>
            <li>Sending in-app notifications about transactions and account updates</li>
            <li>Delivering promotional banners and offers within the App</li>
            <li>Sending password reset and PIN reset verification emails</li>
          </ul>

          <h3 className="text-base font-semibold mb-2">3.4 Analytics and Improvement</h3>
          <ul className="list-disc pl-5 mb-4 text-sm space-y-1">
            <li>Analyzing usage patterns to improve App performance and user experience</li>
            <li>Debugging application issues and crashes</li>
            <li>Monitoring service availability and performance</li>
          </ul>

          <h2 className="text-xl font-bold mb-3">4. Third-Party Service Providers</h2>
          <p className="mb-2 text-sm leading-relaxed">
            We share certain information with trusted third-party service providers to deliver our services:
          </p>
          <ul className="list-disc pl-5 mb-4 text-sm space-y-1">
            <li><strong>RGC Data API</strong> — our primary service provider for processing airtime, data, electricity, cable TV, and exam pin transactions. We share phone numbers, meter numbers, smart card numbers, and transaction amounts as necessary to fulfill your purchases.</li>
            <li><strong>PaymentPoint</strong> — our payment infrastructure provider for virtual account generation and deposit processing. We share your name, email, and phone number to create your virtual bank account.</li>
            <li><strong>PalmPay</strong> — the banking partner through which virtual accounts are provisioned for wallet funding. Where you choose to generate a PalmPay account number, we share your name, phone number, and National Identity Number (NIN) with PalmPay, as required by Central Bank of Nigeria (CBN) know-your-customer (KYC) regulations.</li>
            <li><strong>Firebase Cloud Messaging (Google)</strong> — used to deliver push notifications to your device. We share your FCM token with Google's servers for notification delivery.</li>
            <li><strong>Resend</strong> — our email service provider for sending password reset emails and PIN reset verification codes.</li>
            <li><strong>Supabase</strong> — our backend infrastructure provider that hosts our database, authentication system, and serverless functions. All data is stored on Supabase's secure cloud infrastructure.</li>
          </ul>
          <p className="mb-4 text-sm leading-relaxed">
            These third parties are contractually obligated to protect your information and use it only for the purposes 
            for which it was disclosed.
          </p>

          <h2 className="text-xl font-bold mb-3">5. Data Storage and Security</h2>
          <ul className="list-disc pl-5 mb-4 text-sm space-y-1">
            <li>All data is transmitted over encrypted HTTPS connections</li>
            <li>Passwords are hashed using industry-standard algorithms and never stored in plain text</li>
            <li>Transaction PINs are stored locally on your device and are not transmitted to our servers</li>
            <li>Biometric data never leaves your device — only the verification result is used</li>
            <li>Database access is protected by Row Level Security (RLS) policies ensuring users can only access their own data</li>
            <li>Wallet balance modifications are restricted to server-side operations only, preventing client-side manipulation</li>
            <li>API keys and sensitive credentials are stored as encrypted server-side environment variables</li>
            <li>Login sessions are tracked and monitored for unauthorized access patterns</li>
          </ul>

          <h2 className="text-xl font-bold mb-3">6. Data Retention</h2>
          <p className="mb-4 text-sm leading-relaxed">
            We retain your personal information for as long as your account is active or as needed to provide you services. 
            Transaction records are retained indefinitely for accounting, auditing, and dispute resolution purposes as required 
            by Nigerian financial regulations. Login session data is retained for security audit purposes. If you request account 
            deletion, we will delete or anonymize your personal information within 30 days, except where retention is required 
            by law or for legitimate business purposes.
          </p>

          <h2 className="text-xl font-bold mb-3">7. Your Rights</h2>
          <p className="mb-2 text-sm leading-relaxed">You have the following rights regarding your personal data:</p>
          <ul className="list-disc pl-5 mb-4 text-sm space-y-1">
            <li><strong>Access</strong> — You can view your personal information, transaction history, and account details within the App</li>
            <li><strong>Correction</strong> — You can update your profile information (name, phone number, email) through the Edit Profile feature</li>
            <li><strong>Deletion</strong> — You can request account deletion by contacting our support team</li>
            <li><strong>Notification Preferences</strong> — You can enable or disable push notifications through the App settings</li>
            <li><strong>Biometric Preferences</strong> — You can enable or disable biometric authentication at any time through Security settings</li>
            <li><strong>Data Portability</strong> — You can request a copy of your data by contacting support</li>
          </ul>

          <h2 className="text-xl font-bold mb-3">8. Children's Privacy</h2>
          <p className="mb-4 text-sm leading-relaxed">
            Our App is not intended for use by individuals under the age of 18. We do not knowingly collect personal 
            information from children under 18. If we become aware that we have collected personal information from a 
            child under 18, we will take steps to delete such information promptly.
          </p>

          <h2 className="text-xl font-bold mb-3">9. Permissions Used</h2>
          <p className="mb-2 text-sm leading-relaxed">The App requests the following device permissions:</p>
          <ul className="list-disc pl-5 mb-4 text-sm space-y-1">
            <li><strong>Internet Access</strong> — Required for all App functionality including service purchases, wallet management, and account operations</li>
            <li><strong>Push Notifications</strong> — To deliver transaction confirmations, credit alerts, and important account notifications</li>
            <li><strong>Biometric Hardware (Fingerprint/Face)</strong> — For optional biometric login and transaction verification. No biometric data is collected or stored by us</li>
            <li><strong>Network State</strong> — To detect connectivity status and handle offline scenarios gracefully</li>
            <li><strong>Vibration</strong> — For haptic feedback on user interactions</li>
            <li><strong>Camera</strong> — For optional profile picture capture</li>
            <li><strong>Clipboard</strong> — To allow copying account numbers, referral codes, and transaction details</li>
            <li><strong>Local Notifications</strong> — To display foreground notifications and scheduled reminders</li>
            <li><strong>Device Information</strong> — To identify device type for login security tracking and platform-specific feature delivery</li>
          </ul>

          <h2 className="text-xl font-bold mb-3">10. App Stability and Compatibility</h2>
          <p className="mb-4 text-sm leading-relaxed">
            SM Data Sub is designed to operate on Android 7.0 (API level 24) and above, and iOS 14 and above. The App 
            implements comprehensive error boundaries, try-catch guards for all native plugin interactions, and platform-specific 
            fallbacks (including cryptographic operations) to ensure stability across all supported devices, including older 
            Android versions. If you experience any crashes or stability issues, please contact our support team with your 
            device model and Android/iOS version.
          </p>

          <h2 className="text-xl font-bold mb-3">11. Promotional Content</h2>
          <p className="mb-4 text-sm leading-relaxed">
            The App may display promotional banners and offers. These are managed by our internal admin team and may include 
            reseller promotions, product offers, and service announcements. Promotional content display is tracked 
            (impressions and clicks) for internal analytics purposes only.
          </p>

          <h2 className="text-xl font-bold mb-3">12. Changes to This Privacy Policy</h2>
          <p className="mb-4 text-sm leading-relaxed">
            We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new 
            Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy Policy 
            periodically for any changes. Changes to this Privacy Policy are effective when they are posted on this page.
          </p>

          <h2 className="text-xl font-bold mb-3">13. Contact Us</h2>
          <p className="mb-2 text-sm leading-relaxed">
            If you have any questions or concerns about this Privacy Policy or our data practices, please contact us:
          </p>
          <ul className="list-none mb-4 text-sm space-y-2">
            <li><strong>Company:</strong> Sir Smarewa Ltd (RC: 9198148)</li>
            <li><strong>App Name:</strong> SM Data Sub</li>
            <li><strong>Email:</strong> smdatasub.ng@gmail.com</li>
            <li><strong>Phone:</strong> 09050799603 / 09078920178</li>
            <li><strong>Website:</strong> www.smdatasub.com.ng</li>
            <li><strong>WhatsApp:</strong> Available via the App's Support section</li>
          </ul>

          <h2 className="text-xl font-bold mb-3">14. Governing Law</h2>
          <p className="mb-4 text-sm leading-relaxed">
            This Privacy Policy is governed by and construed in accordance with the Nigeria Data Protection Regulation (NDPR) 
            and the Nigeria Data Protection Act (NDPA) 2023. Any disputes arising under this policy shall be subject to the 
            exclusive jurisdiction of Nigerian courts.
          </p>
        </div>
      </div>
    </div>
  );
}
