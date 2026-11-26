import Link from 'next/link';
import { Activity, Calendar, Shield, Users, FlaskConical, Receipt, ClipboardList } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-teal-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Activity className="h-8 w-8 text-sky-600" />
            <span className="text-2xl font-bold text-gray-900">MediCore</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-sky-600 transition-colors">
              Sign In
            </Link>
            <Link href="/register" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors">
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="container mx-auto px-4 py-20 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            Hospital Management
            <span className="block text-sky-600">Made Simple</span>
          </h1>
          <p className="mt-6 text-lg text-gray-600">
            MediCore is a comprehensive hospital, appointment, and patient care management platform.
            Streamline your healthcare operations with role-based dashboards, clinical workflows,
            laboratory management, and secure patient records.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link href="/login" className="rounded-lg bg-sky-600 px-8 py-3 text-sm font-semibold text-white shadow-lg hover:bg-sky-700 transition-all">
              Sign In to Dashboard
            </Link>
            <Link href="/register" className="rounded-lg border border-gray-300 bg-white px-8 py-3 text-sm font-semibold text-gray-700 shadow hover:bg-gray-50 transition-all">
              Register as Patient
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-24 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Users, title: 'Patient Management', desc: 'Complete patient registration, records, and history management' },
            { icon: Calendar, title: 'Appointment Scheduling', desc: 'Smart scheduling with conflict prevention and workflow tracking' },
            { icon: ClipboardList, title: 'Clinical Encounters', desc: 'Diagnoses, prescriptions, vital signs, and clinical notes' },
            { icon: FlaskConical, title: 'Laboratory Management', desc: 'Lab orders, specimen tracking, results, and validation' },
            { icon: Receipt, title: 'Billing & Payments', desc: 'Invoice generation, payment tracking, and financial reports' },
            { icon: Shield, title: 'Security & Compliance', desc: 'Role-based access, consent management, and audit trails' },
          ].map((feature, i) => (
            <div key={i} className="rounded-xl border bg-white p-6 text-left shadow-sm hover:shadow-md transition-shadow">
              <feature.icon className="h-10 w-10 text-sky-600" />
              <h3 className="mt-4 text-lg font-semibold text-gray-900">{feature.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{feature.desc}</p>
            </div>
          ))}
        </div>

        {/* Roles */}
        <div className="mt-24">
          <h2 className="text-3xl font-bold text-gray-900">Role-Based Dashboards</h2>
          <p className="mt-4 text-gray-600">Tailored experiences for every hospital role</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {['Patient', 'Receptionist', 'Doctor', 'Nurse', 'Lab Technician', 'Billing Officer', 'Administrator'].map(role => (
              <span key={role} className="rounded-full bg-sky-100 px-4 py-2 text-sm font-medium text-sky-800">{role}</span>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t bg-white py-8 text-center text-sm text-gray-500">
        <p>MediCore Hospital Management Platform — Educational Project with Synthetic Data</p>
        <p className="mt-1">This system does not process real patient data or provide medical advice.</p>
      </footer>
    </div>
  );
}
