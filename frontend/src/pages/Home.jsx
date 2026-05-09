import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import BookingForm from "@/components/BookingForm";
import Services from "@/components/Services";
import ServiceFeatures from "@/components/ServiceFeatures";
import About from "@/components/About";
import Coverage from "@/components/Coverage";
import Events from "@/components/Events";
import ThingsToDo from "@/components/ThingsToDo";
import Testimonials from "@/components/Testimonials";
import ContactForm from "@/components/ContactForm";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main data-testid="home-page" className="bg-[#050505] text-white">
      <Navbar />
      <Hero />
      <HowItWorks />
      <BookingForm />
      <Services />
      <ServiceFeatures />
      <About />
      <Coverage />
      <Events />
      <ThingsToDo />
      <Testimonials />
      <ContactForm />
      <Footer />
    </main>
  );
}
