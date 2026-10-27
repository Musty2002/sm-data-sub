import { MobileLayout } from '@/components/layout/MobileLayout';
import { 
  ArrowLeft, 
  MessageCircle, 
  Phone, 
  Mail, 
  FileQuestion, 
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const faqs = [
  {
    question: 'How do I fund my wallet?',
    answer: 'You can fund your wallet by transferring money to your virtual account number displayed on your dashboard. Funds are credited instantly.',
  },
  {
    question: 'How long does data delivery take?',
    answer: 'Data bundles are delivered instantly after a successful purchase. If you don\'t receive it within 5 minutes, please contact support.',
  },
  {
    question: 'What happens if my transaction fails?',
    answer: 'If a transaction fails, your wallet will be refunded automatically within a few minutes. If not refunded after 30 minutes, contact support.',
  },
  {
    question: 'How do I refer friends and earn?',
    answer: 'Share your unique referral code with friends. When they sign up and make their first transaction, both of you earn bonus rewards!',
  },
  {
    question: 'Is my money safe?',
    answer: 'Yes! We use bank-level security to protect your funds and personal information. All transactions are encrypted and secure.',
  },
];

const contactOptions = [
  {
    icon: MessageCircle,
    label: 'Live Chat',
    description: 'Chat with our support team',
    action: () => window.open('https://wa.me/2349050799603', '_blank'),
  },
  {
    icon: Phone,
    label: 'Call Us',
    description: '0905 079 9603',
    action: () => window.open('tel:+2349050799603', '_blank'),
  },
  {
    icon: Phone,
    label: 'Customer Care',
    description: '0907 892 0178',
    action: () => window.open('tel:+2349078920178', '_blank'),
  },
  {
    icon: Mail,
    label: 'Email Support',
    description: 'smdatasub.ng@gmail.com',
    action: () => window.open('mailto:smdatasub.ng@gmail.com', '_blank'),
  },
];

export default function Support() {
  const navigate = useNavigate();

  return (
    <MobileLayout showNav={false}>
      <div className="safe-area-top px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-card flex items-center justify-center shadow-sm"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-xl font-bold text-foreground">Help & Support</h1>
        </div>

        <div className="space-y-6">
          {/* Contact Options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact Us</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {contactOptions.map(({ icon: Icon, label, description, action }) => (
                <button
                  key={label}
                  onClick={action}
                  className="w-full flex items-center gap-4 p-3 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>

          {/* FAQs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileQuestion className="w-5 h-5 text-primary" />
                Frequently Asked Questions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="text-left text-sm">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground text-sm">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          {/* Additional Help */}
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Can't find what you're looking for?
                </p>
                <p className="text-xs text-muted-foreground">
                  Our support team is available 24/7 to help you with any issues.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MobileLayout>
  );
}
